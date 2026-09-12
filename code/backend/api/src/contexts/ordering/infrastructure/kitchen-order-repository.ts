import { and, eq, inArray, isNull, sql, withTenant, type Database, tables } from '@veyroxai/db';
import type { OrderTicket } from '@veyroxai/contracts';
import { REVERT_WINDOW_SECONDS, type EtaCartItem, type LoyaltyTier } from '@veyroxai/domain';
import {
  canTransition,
  isRevertEligible,
  legalNextStatuses,
  type OrderStatus,
} from '../domain/order-state-machine.js';
import { buildOrderTicket, type OrderTicketSource } from '../application/order-ticket-view.js';

export class OrderNotFound extends Error {
  constructor() {
    super('No such order for this tenant.');
    this.name = 'OrderNotFound';
  }
}

export class InvalidTransition extends Error {
  constructor(readonly allowedTransitions: readonly OrderStatus[]) {
    super('This transition is not legal from the order current status.');
    this.name = 'InvalidTransition';
  }
}

export class ItemNoLongerAvailable extends Error {
  constructor(readonly unavailable: readonly { menuItemId: string; modifierOptionId?: string }[]) {
    super('An item or modifier was 86ed after this order was placed.');
    this.name = 'ItemNoLongerAvailable';
  }
}

export class RevertWindowExpired extends Error {
  constructor() {
    super('This can no longer be undone from the KDS - void the order instead.');
    this.name = 'RevertWindowExpired';
  }
}

export class OrderItemNotFound extends Error {
  constructor() {
    super('No such item on this order.');
    this.name = 'OrderItemNotFound';
  }
}

/** Converts a NUMERIC(14,6) recipe-line quantity, scaled by an integer order
 *  quantity, to a NUMERIC(14,6)-safe string - no floats (ADR-0007). */
function scaleMaterialQty(recipeLineQty: string, orderQty: number): bigint {
  const [whole = '0', fraction = ''] = recipeLineQty.split('.');
  const digits = `${fraction}000000`.slice(0, 6);
  return (BigInt(whole) * 1_000_000n + BigInt(digits)) * BigInt(orderQty);
}

function numericStringFromScaled(scaledBy1e6: bigint): string {
  const negative = scaledBy1e6 < 0n;
  const abs = negative ? -scaledBy1e6 : scaledBy1e6;
  return `${negative ? '-' : ''}${abs / 1_000_000n}.${(abs % 1_000_000n).toString().padStart(6, '0')}`;
}

export class KitchenOrderRepository {
  constructor(private readonly db: Database) {}

  /** Application-layer pre-read for F1.4's ETA calc, evaluated fresh at Accept
   *  (backend doc §2.1 step 4) - outside the write transaction, exactly how
   *  PlaceOrder reads the queue before its own transactional write. */
  async loadCartForEta(
    tenantId: string,
    orderId: string,
  ): Promise<{ items: EtaCartItem[]; customerTier: LoyaltyTier | null } | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: and(eq(tables.orders.tenantId, tenantId), eq(tables.orders.id, orderId)),
      });
      if (!order) return null;
      const items = await tx
        .select({ basePrepSeconds: tables.menuItems.basePrepSeconds })
        .from(tables.orderItems)
        .innerJoin(tables.menuItems, eq(tables.menuItems.id, tables.orderItems.menuItemId))
        .where(
          and(eq(tables.orderItems.tenantId, tenantId), eq(tables.orderItems.orderId, orderId)),
        );
      const customer = order.customerId
        ? await tx.query.customers.findFirst({
            where: and(
              eq(tables.customers.tenantId, tenantId),
              eq(tables.customers.id, order.customerId),
            ),
          })
        : null;
      return {
        items: items.map((item) => ({ prepSeconds: item.basePrepSeconds })),
        customerTier: (customer?.tier as LoyaltyTier | undefined) ?? null,
      };
    });
  }

  async accept(input: {
    tenantId: string;
    orderId: string;
    idempotencyKey: string;
    staffId: string;
    now: Date;
    etaMinutes: { lowerMinutes: number; upperMinutes: number };
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      // §2.2: a concurrent duplicate of this exact key must not re-run step 3
      // (ledger inserts) — checked before touching anything else.
      const existingEvent = await tx.query.orderEvents.findFirst({
        where: and(
          eq(tables.orderEvents.tenantId, input.tenantId),
          eq(tables.orderEvents.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existingEvent) {
        const ticket = await this.loadTicket(tx, input.tenantId, existingEvent.orderId, input.now);
        if (!ticket) throw new OrderNotFound();
        return { ticket, replayed: true };
      }

      const order = await tx.query.orders.findFirst({
        where: and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, input.orderId)),
      });
      if (!order) throw new OrderNotFound();
      const status = order.status as OrderStatus;

      // 01-system-design.md §4.3: re-entering the current state is a no-op, not
      // an error - a barista's Accept tap racing a slow first response, or a
      // fresh idempotency key from a client retry that never saw the first 200.
      if (status === 'received') {
        const ticket = await this.loadTicket(tx, input.tenantId, order.id, input.now);
        if (!ticket) throw new OrderNotFound();
        return { ticket, replayed: true };
      }
      if (!canTransition(status, 'received'))
        throw new InvalidTransition(legalNextStatuses(status));

      const items = await tx
        .select()
        .from(tables.orderItems)
        .where(
          and(
            eq(tables.orderItems.tenantId, input.tenantId),
            eq(tables.orderItems.orderId, order.id),
          ),
        );
      const modifiers = items.length
        ? await tx
            .select()
            .from(tables.orderItemModifiers)
            .where(
              inArray(
                tables.orderItemModifiers.orderItemId,
                items.map((item) => item.id),
              ),
            )
        : [];

      // Step 2: re-check availability against *current* state - an item can have
      // been 86'd in the minutes between placement and Accept (backend doc §2.1).
      const menuItemIds = [...new Set(items.map((item) => item.menuItemId))];
      const modifierOptionIds = [
        ...new Set(modifiers.map((modifier) => modifier.modifierOptionId)),
      ];
      const [unavailableItems, unavailableOptions] = await Promise.all([
        menuItemIds.length
          ? tx
              .select({ id: tables.menuItems.id })
              .from(tables.menuItems)
              .where(
                and(
                  eq(tables.menuItems.tenantId, input.tenantId),
                  inArray(tables.menuItems.id, menuItemIds),
                  eq(tables.menuItems.isAvailable, false),
                ),
              )
          : Promise.resolve([]),
        modifierOptionIds.length
          ? tx
              .select({ id: tables.modifierOptions.id })
              .from(tables.modifierOptions)
              .where(
                and(
                  eq(tables.modifierOptions.tenantId, input.tenantId),
                  inArray(tables.modifierOptions.id, modifierOptionIds),
                  eq(tables.modifierOptions.isAvailable, false),
                ),
              )
          : Promise.resolve([]),
      ]);
      const unavailableItemIds = new Set(unavailableItems.map((row) => row.id));
      const unavailableOptionIds = new Set(unavailableOptions.map((row) => row.id));
      const unavailable = [
        ...items
          .filter((item) => unavailableItemIds.has(item.menuItemId))
          .map((item) => ({ menuItemId: item.menuItemId })),
        ...modifiers
          .filter((modifier) => unavailableOptionIds.has(modifier.modifierOptionId))
          .flatMap((modifier) => {
            const item = items.find((candidate) => candidate.id === modifier.orderItemId);
            return item
              ? [{ menuItemId: item.menuItemId, modifierOptionId: modifier.modifierOptionId }]
              : [];
          }),
      ];
      if (unavailable.length) throw new ItemNoLongerAvailable(unavailable);

      // Step 3: one material_ledger row per (order_item, recipe_line). Never
      // recomputes order_items.cost_snapshot_minor - F1 already set that at
      // placement (verified against order-placement-repository.ts); re-snapshotting
      // it here would violate the "computed once" spirit of the snapshot columns.
      const recipeVersionIds = [...new Set(items.map((item) => item.recipeVersionId))];
      const recipeLineRows = recipeVersionIds.length
        ? await tx
            .select()
            .from(tables.recipeLines)
            .where(inArray(tables.recipeLines.recipeId, recipeVersionIds))
        : [];
      const materialIds = [...new Set(recipeLineRows.map((line) => line.materialId))];
      // "unit_cost_snapshot ... cost at movement time, for COGS" (04-data-model.md
      // §7) - a fresh lookup at Accept, deliberately independent of order_items'
      // own placement-time cost_snapshot_minor.
      const currentCosts = materialIds.length
        ? await tx
            .select()
            .from(tables.materialCosts)
            .where(
              and(
                eq(tables.materialCosts.tenantId, input.tenantId),
                inArray(tables.materialCosts.materialId, materialIds),
                isNull(tables.materialCosts.validTo),
              ),
            )
        : [];
      const costByMaterial = new Map(
        currentCosts.map((cost) => [cost.materialId, cost.costPerUnit]),
      );
      const modifiersByOrderItem = new Map<string, string[]>();
      for (const modifier of modifiers) {
        const existing = modifiersByOrderItem.get(modifier.orderItemId) ?? [];
        existing.push(modifier.modifierOptionId);
        modifiersByOrderItem.set(modifier.orderItemId, existing);
      }

      const ledgerRows = items.flatMap((item) => {
        const selectedModifiers = new Set(modifiersByOrderItem.get(item.id) ?? []);
        return recipeLineRows
          .filter(
            (line) =>
              line.recipeId === item.recipeVersionId &&
              (!line.modifierOptionId || selectedModifiers.has(line.modifierOptionId)),
          )
          .map((line) => ({
            tenantId: input.tenantId,
            materialId: line.materialId,
            qtyDelta: numericStringFromScaled(-scaleMaterialQty(line.qty, item.qty)),
            reason: 'sale_deduction',
            orderId: order.id,
            orderItemId: item.id,
            recipeVersionId: item.recipeVersionId,
            unitCostSnapshot: costByMaterial.get(line.materialId) ?? null,
            actorType: 'staff',
            actorId: input.staffId,
          }));
      });
      if (ledgerRows.length) await tx.insert(tables.materialLedger).values(ledgerRows);

      // Step 4: promised ETA evaluated fresh at Accept (F1.7 §1: "the confirmation
      // fires on Accept, not on placement").
      const promisedEtaLowerAt = new Date(
        input.now.getTime() + input.etaMinutes.lowerMinutes * 60_000,
      );
      const promisedEtaUpperAt = new Date(
        input.now.getTime() + input.etaMinutes.upperMinutes * 60_000,
      );

      await tx
        .update(tables.orders)
        .set({
          status: 'received',
          acceptedAt: input.now,
          promisedEtaLowerAt,
          promisedEtaUpperAt,
        })
        .where(and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, order.id)));

      // §2.2: this insert is the actual dedup mechanism. A concurrent duplicate
      // racing to this point hits the unique (tenant_id, idempotency_key) index
      // and rolls back its whole transaction, ledger writes included.
      await tx.insert(tables.orderEvents).values({
        tenantId: input.tenantId,
        orderId: order.id,
        fromStatus: status,
        toStatus: 'received',
        actorType: 'staff',
        actorId: input.staffId,
        source: 'kds',
        idempotencyKey: input.idempotencyKey,
        createdAt: input.now,
      });

      const ticket = await this.loadTicket(tx, input.tenantId, order.id, input.now);
      if (!ticket) throw new OrderNotFound();
      return { ticket, replayed: false };
    });
  }

  /** New-column only (backend doc §2.3): a ticket already Accepted must go through
   *  Void instead, never Reject - INV-7 ("no rejected order has any ledger rows at
   *  all") is what this guard protects; there is nothing to un-deduct because
   *  Accept never ran. */
  async reject(input: {
    tenantId: string;
    orderId: string;
    reasonCode: 'too_busy' | 'item_unavailable' | 'closing';
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      const existingEvent = await tx.query.orderEvents.findFirst({
        where: and(
          eq(tables.orderEvents.tenantId, input.tenantId),
          eq(tables.orderEvents.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existingEvent) {
        const ticket = await this.loadTicket(tx, input.tenantId, existingEvent.orderId, input.now);
        if (!ticket) throw new OrderNotFound();
        return { ticket, replayed: true };
      }

      const order = await tx.query.orders.findFirst({
        where: and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, input.orderId)),
      });
      if (!order) throw new OrderNotFound();
      const status = order.status as OrderStatus;

      if (status === 'rejected') {
        const ticket = await this.loadTicket(tx, input.tenantId, order.id, input.now);
        if (!ticket) throw new OrderNotFound();
        return { ticket, replayed: true };
      }
      if (!canTransition(status, 'rejected'))
        throw new InvalidTransition(legalNextStatuses(status));

      await tx
        .update(tables.orders)
        .set({ status: 'rejected', rejectionReason: input.reasonCode, rejectedAt: input.now })
        .where(and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, order.id)));

      await tx.insert(tables.orderEvents).values({
        tenantId: input.tenantId,
        orderId: order.id,
        fromStatus: status,
        toStatus: 'rejected',
        actorType: 'staff',
        actorId: input.staffId,
        reason: input.reasonCode,
        source: 'kds',
        idempotencyKey: input.idempotencyKey,
        createdAt: input.now,
      });

      const ticket = await this.loadTicket(tx, input.tenantId, order.id, input.now);
      if (!ticket) throw new OrderNotFound();
      return { ticket, replayed: false };
    });
  }

  /** Received->Preparing, Preparing->Ready - board taps and tap-to-advance
   *  (05-api-and-integration-contracts.md §3). Already-in-toStatus is a 200
   *  no-op (FR-3.5: baristas double-tap), never a 409. */
  async advance(input: {
    tenantId: string;
    orderId: string;
    toStatus: 'preparing' | 'ready';
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      const existingEvent = await tx.query.orderEvents.findFirst({
        where: and(
          eq(tables.orderEvents.tenantId, input.tenantId),
          eq(tables.orderEvents.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existingEvent) {
        const ticket = await this.loadTicket(tx, input.tenantId, existingEvent.orderId, input.now);
        if (!ticket) throw new OrderNotFound();
        return { ticket, replayed: true };
      }

      const order = await tx.query.orders.findFirst({
        where: and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, input.orderId)),
      });
      if (!order) throw new OrderNotFound();
      const status = order.status as OrderStatus;

      if (status === input.toStatus) {
        const ticket = await this.loadTicket(tx, input.tenantId, order.id, input.now);
        if (!ticket) throw new OrderNotFound();
        return { ticket, replayed: true };
      }
      if (!canTransition(status, input.toStatus))
        throw new InvalidTransition(legalNextStatuses(status));

      await tx
        .update(tables.orders)
        .set(
          input.toStatus === 'ready'
            ? { status: 'ready', readyAt: input.now }
            : { status: 'preparing' },
        )
        .where(and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, order.id)));

      await tx.insert(tables.orderEvents).values({
        tenantId: input.tenantId,
        orderId: order.id,
        fromStatus: status,
        toStatus: input.toStatus,
        actorType: 'staff',
        actorId: input.staffId,
        source: 'kds',
        idempotencyKey: input.idempotencyKey,
        createdAt: input.now,
      });

      const ticket = await this.loadTicket(tx, input.tenantId, order.id, input.now);
      if (!ticket) throw new OrderNotFound();
      return { ticket, replayed: false };
    });
  }

  /** Undo one status transition within 60s (FR-3.7, backend doc §2.5). Never a
   *  financial reversal - void is the only path that reverses the ledger. */
  async revert(input: {
    tenantId: string;
    orderId: string;
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      const existingEvent = await tx.query.orderEvents.findFirst({
        where: and(
          eq(tables.orderEvents.tenantId, input.tenantId),
          eq(tables.orderEvents.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existingEvent) {
        const ticket = await this.loadTicket(tx, input.tenantId, existingEvent.orderId, input.now);
        if (!ticket) throw new OrderNotFound();
        return { ticket, replayed: true };
      }

      const order = await tx.query.orders.findFirst({
        where: and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, input.orderId)),
      });
      if (!order) throw new OrderNotFound();
      const status = order.status as OrderStatus;
      // `voided`/`abandoned`/`collected` already moved money or materials for
      // real - their own dedicated path is the only legal way back, never this
      // generic undo (order-state-machine.ts's isRevertEligible doc comment).
      if (!isRevertEligible(status)) throw new InvalidTransition(legalNextStatuses(status));

      // Step 1: the event that produced the current status, staff-actored only -
      // a customer- or system-caused status is not staff's to undo. Excludes
      // item_tick events explicitly: those are also actor_type='staff' with
      // to_status left unchanged (§2.6), so without this filter a tick fired
      // after the real transition would be mistaken for "the event that
      // produced the current status" and both reset the 60s window and make
      // fromStatus equal the current status (a no-op revert with a nonsense
      // audit row).
      const lastStaffEvent = await tx.query.orderEvents.findFirst({
        where: and(
          eq(tables.orderEvents.tenantId, input.tenantId),
          eq(tables.orderEvents.orderId, order.id),
          eq(tables.orderEvents.toStatus, status),
          eq(tables.orderEvents.actorType, 'staff'),
          sql`coalesce(${tables.orderEvents.metadata} ->> 'action', '') != 'item_tick'`,
        ),
        orderBy: (events, { desc }) => [desc(events.id)],
      });
      if (!lastStaffEvent?.fromStatus) throw new InvalidTransition(legalNextStatuses(status));

      // Step 2: server clock, not client - the frontend's countdown is a UX
      // affordance only, never the source of truth for whether undo is allowed.
      const elapsedSeconds = (input.now.getTime() - lastStaffEvent.createdAt.getTime()) / 1000;
      if (elapsedSeconds >= REVERT_WINDOW_SECONDS) throw new RevertWindowExpired();

      const fromStatus = lastStaffEvent.fromStatus as OrderStatus;

      // Pure status rollback - never touches accepted_at/ready_at/ledger/loyalty
      // (FR-3.7/INV-7: "the reversal is logged, but... not un-sent/un-deducted").
      await tx
        .update(tables.orders)
        .set({ status: fromStatus })
        .where(and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, order.id)));

      // A new, additive event - append-only for the same reason the ledger is:
      // an auditor needs to see a revert happened, not just its net effect.
      await tx.insert(tables.orderEvents).values({
        tenantId: input.tenantId,
        orderId: order.id,
        fromStatus: status,
        toStatus: fromStatus,
        actorType: 'staff',
        actorId: input.staffId,
        reason: 'undo',
        metadata: { revertsEventId: lastStaffEvent.id },
        source: 'kds',
        idempotencyKey: input.idempotencyKey,
        createdAt: input.now,
      });

      const ticket = await this.loadTicket(tx, input.tenantId, order.id, input.now);
      if (!ticket) throw new OrderNotFound();
      return { ticket, replayed: false };
    });
  }

  /** Event-only, no status change (§2.6) - doesn't need accept/advance's heavier
   *  shape because there is nothing to guard beyond "the order is still being
   *  worked." Ticking a `ready` or terminal order is meaningless. */
  async tickItem(input: {
    tenantId: string;
    orderId: string;
    orderItemId: string;
    ticked: boolean;
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ orderItemId: string; ticked: boolean; replayed: boolean }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      const existingEvent = await tx.query.orderEvents.findFirst({
        where: and(
          eq(tables.orderEvents.tenantId, input.tenantId),
          eq(tables.orderEvents.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existingEvent)
        return { orderItemId: input.orderItemId, ticked: input.ticked, replayed: true };

      const order = await tx.query.orders.findFirst({
        where: and(eq(tables.orders.tenantId, input.tenantId), eq(tables.orders.id, input.orderId)),
      });
      if (!order) throw new OrderNotFound();
      const status = order.status as OrderStatus;
      if (status !== 'received' && status !== 'preparing')
        throw new InvalidTransition(legalNextStatuses(status));

      const item = await tx.query.orderItems.findFirst({
        where: and(
          eq(tables.orderItems.tenantId, input.tenantId),
          eq(tables.orderItems.id, input.orderItemId),
          eq(tables.orderItems.orderId, input.orderId),
        ),
      });
      if (!item) throw new OrderItemNotFound();

      await tx.insert(tables.orderEvents).values({
        tenantId: input.tenantId,
        orderId: order.id,
        fromStatus: status,
        toStatus: status,
        actorType: 'staff',
        actorId: input.staffId,
        source: 'kds',
        metadata: { action: 'item_tick', orderItemId: input.orderItemId, ticked: input.ticked },
        idempotencyKey: input.idempotencyKey,
        createdAt: input.now,
      });

      return { orderItemId: input.orderItemId, ticked: input.ticked, replayed: false };
    });
  }

  private async loadTicket(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    tenantId: string,
    orderId: string,
    now: Date,
  ): Promise<OrderTicket | null> {
    const order = await tx.query.orders.findFirst({
      where: and(eq(tables.orders.tenantId, tenantId), eq(tables.orders.id, orderId)),
    });
    if (!order) return null;

    const [items, lastStaffEvent, customer] = await Promise.all([
      tx
        .select()
        .from(tables.orderItems)
        .where(
          and(eq(tables.orderItems.tenantId, tenantId), eq(tables.orderItems.orderId, orderId)),
        ),
      tx.query.orderEvents.findFirst({
        // Excludes item_tick events - see the identical filter in revert() for why.
        where: and(
          eq(tables.orderEvents.tenantId, tenantId),
          eq(tables.orderEvents.orderId, orderId),
          eq(tables.orderEvents.toStatus, order.status),
          eq(tables.orderEvents.actorType, 'staff'),
          sql`coalesce(${tables.orderEvents.metadata} ->> 'action', '') != 'item_tick'`,
        ),
        orderBy: (events, { desc }) => [desc(events.id)],
      }),
      order.customerId
        ? tx.query.customers.findFirst({
            where: and(
              eq(tables.customers.tenantId, tenantId),
              eq(tables.customers.id, order.customerId),
            ),
          })
        : Promise.resolve(null),
    ]);

    const modifiers = items.length
      ? await tx
          .select()
          .from(tables.orderItemModifiers)
          .where(
            inArray(
              tables.orderItemModifiers.orderItemId,
              items.map((item) => item.id),
            ),
          )
      : [];
    const modifiersByOrderItem = new Map<string, typeof modifiers>();
    for (const modifier of modifiers) {
      const existing = modifiersByOrderItem.get(modifier.orderItemId) ?? [];
      existing.push(modifier);
      modifiersByOrderItem.set(modifier.orderItemId, existing);
    }

    // §2.6: current tick state is the *last* item_tick event per orderItemId -
    // a small, bounded fold (a handful of rows per order), not a materialized
    // view. Ordered ascending so later writes to the map win.
    const tickEvents = items.length
      ? await tx
          .select({
            orderItemId: sql<string>`${tables.orderEvents.metadata} ->> 'orderItemId'`,
            ticked: sql<boolean>`(${tables.orderEvents.metadata} ->> 'ticked')::boolean`,
          })
          .from(tables.orderEvents)
          .where(
            and(
              eq(tables.orderEvents.tenantId, tenantId),
              eq(tables.orderEvents.orderId, orderId),
              sql`${tables.orderEvents.metadata} ->> 'action' = 'item_tick'`,
            ),
          )
          .orderBy(tables.orderEvents.id)
      : [];
    const tickedByItem = new Map<string, boolean>();
    for (const event of tickEvents) tickedByItem.set(event.orderItemId, event.ticked);

    const source: OrderTicketSource = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      channel: order.channel as 'whatsapp' | 'cashier',
      status: order.status as OrderStatus,
      tableLabel: order.tableLabel,
      customerNote: order.customerNote,
      placedAt: order.createdAt,
      acceptedAt: order.acceptedAt,
      promisedEtaUpperAt: order.promisedEtaUpperAt,
      customer: customer
        ? { displayName: customer.displayName, tier: customer.tier as 'bronze' | 'silver' | 'gold' }
        : null,
      items: items.map((item) => ({
        orderItemId: item.id,
        qty: item.qty,
        nameSnapshotEn: item.nameSnapshotEn,
        nameSnapshotAr: item.nameSnapshotAr,
        modifiers: (modifiersByOrderItem.get(item.id) ?? []).map((modifier) => ({
          nameSnapshotEn: modifier.nameSnapshotEn,
          nameSnapshotAr: modifier.nameSnapshotAr,
        })),
        ticked: tickedByItem.get(item.id) ?? false,
      })),
      lastStaffTransitionAt: lastStaffEvent?.createdAt ?? null,
    };
    return buildOrderTicket(source, now);
  }
}
