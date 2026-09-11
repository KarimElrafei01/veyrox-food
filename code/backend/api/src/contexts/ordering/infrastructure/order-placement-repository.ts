import { and, eq, inArray, isNull, sql, withTenant, type Database, tables } from '@veyroxai/db';
import type { PricedCart } from '@veyroxai/domain';

export class OpenOrderLimit extends Error {
  constructor(readonly existing: { orderId: string; orderNumber: string; status: string }) {
    super('A customer already has an open order.');
    this.name = 'OpenOrderLimit';
  }
}

export class CatalogueSnapshotMissing extends Error {
  constructor() {
    super('A published item has no active recipe or price version.');
    this.name = 'CatalogueSnapshotMissing';
  }
}

export class ItemsUnavailableAtPlacement extends Error {
  constructor(readonly unavailable: readonly { menuItemId: string; modifierOptionId?: string }[]) {
    super('One or more items were 86ed while the customer was ordering.');
    this.name = 'ItemsUnavailableAtPlacement';
  }
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  status: 'placed';
  totalMinor: number;
  subtotalMinor: number;
  placedAt: string;
}

/** Keeps all durable placement facts together; effects are deliberately outside this repository. */
export class OrderPlacementRepository {
  constructor(private readonly db: Database) {}

  async findReplay(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<{ order: PlacedOrder; response: unknown } | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      const row = await tx.query.orders.findFirst({
        where: and(
          eq(tables.orders.tenantId, tenantId),
          eq(tables.orders.idempotencyKey, idempotencyKey),
        ),
      });
      if (!row) return null;
      return {
        order: {
          orderId: row.id,
          orderNumber: row.orderNumber,
          status: 'placed',
          totalMinor: row.totalMinor,
          subtotalMinor: row.subtotalMinor,
          placedAt: row.createdAt.toISOString(),
        },
        response: row.placementResponse,
      };
    });
  }

  async place(input: {
    tenantId: string;
    customerId: string;
    menuVersionId: string;
    idempotencyKey: string;
    cart: PricedCart;
    tableLabel: string | null;
    customerNote: string | null;
    /** The parts of the F1.6 §2 body the domain already knows; the repository fills
     *  in `orderId`, `orderNumber` and `placedAt` once the row exists, then freezes
     *  the whole thing so a replay is byte-identical (F1.6 §5). */
    responseSeed: {
      payAt: 'counter';
      eta: {
        lowerMinutes: number;
        upperMinutes: number;
        startsOnAccept: true;
        promisedLowerAt: null;
        promisedUpperAt: null;
      };
      loyalty: { pointsToEarn: number };
      traceId: string;
    };
  }): Promise<{ order: PlacedOrder; response: unknown; replayed: boolean }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      // Serialising this customer's placement prevents two devices bypassing the
      // open-order cap by racing between the SELECT and the INSERT. It also means
      // concurrent identical requests queue up on this lock instead of racing the
      // INSERT itself — the first one through creates the order, everyone behind it
      // lands on the `replay` branch below and must be told so (`replayed: true`),
      // or the caller has no way to tell it apart from a fresh placement.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.customerId}`}))`,
      );
      const replay = await tx.query.orders.findFirst({
        where: and(
          eq(tables.orders.tenantId, input.tenantId),
          eq(tables.orders.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (replay) {
        return {
          order: {
            orderId: replay.id,
            orderNumber: replay.orderNumber,
            status: 'placed',
            totalMinor: replay.totalMinor,
            subtotalMinor: replay.subtotalMinor,
            placedAt: replay.createdAt.toISOString(),
          },
          response: replay.placementResponse,
          replayed: true,
        };
      }

      const open = await tx.query.orders.findFirst({
        where: and(
          eq(tables.orders.tenantId, input.tenantId),
          eq(tables.orders.customerId, input.customerId),
          sql`${tables.orders.status} in ('placed', 'received', 'preparing', 'ready')`,
        ),
      });
      if (open)
        throw new OpenOrderLimit({
          orderId: open.id,
          orderNumber: open.orderNumber,
          status: open.status,
        });

      const itemIds = input.cart.lines.map((line) => line.menuItemId);
      const modifierIds = input.cart.lines.flatMap((line) =>
        line.modifiers.map((modifier) => modifier.id),
      );
      const [published, prices, recipes, unavailableItems, unavailableOptions] = await Promise.all([
        tx
          .select()
          .from(tables.menuVersionItems)
          .where(
            and(
              eq(tables.menuVersionItems.tenantId, input.tenantId),
              eq(tables.menuVersionItems.menuVersionId, input.menuVersionId),
            ),
          ),
        tx
          .select()
          .from(tables.menuItemPrices)
          .where(
            and(
              eq(tables.menuItemPrices.tenantId, input.tenantId),
              isNull(tables.menuItemPrices.validTo),
            ),
          ),
        tx
          .select()
          .from(tables.recipes)
          .where(and(eq(tables.recipes.tenantId, input.tenantId), isNull(tables.recipes.validTo))),
        // Authoritative 86 check (F1.6 §4). The pinned menu the quote used may be up
        // to a day stale in cache; the live `is_available` flag is the truth.
        itemIds.length
          ? tx
              .select({ id: tables.menuItems.id })
              .from(tables.menuItems)
              .where(
                and(
                  eq(tables.menuItems.tenantId, input.tenantId),
                  inArray(tables.menuItems.id, itemIds),
                  eq(tables.menuItems.isAvailable, false),
                ),
              )
          : Promise.resolve([]),
        modifierIds.length
          ? tx
              .select({ id: tables.modifierOptions.id })
              .from(tables.modifierOptions)
              .where(
                and(
                  eq(tables.modifierOptions.tenantId, input.tenantId),
                  inArray(tables.modifierOptions.id, modifierIds),
                  eq(tables.modifierOptions.isAvailable, false),
                ),
              )
          : Promise.resolve([]),
      ]);

      const unavailable = [
        ...unavailableItems.map((row) => ({ menuItemId: row.id })),
        ...unavailableOptions.flatMap((row) => {
          const line = input.cart.lines.find((candidate) =>
            candidate.modifiers.some((modifier) => modifier.id === row.id),
          );
          return line ? [{ menuItemId: line.menuItemId, modifierOptionId: row.id }] : [];
        }),
      ];
      if (unavailable.length) throw new ItemsUnavailableAtPlacement(unavailable);

      const publication = new Map(published.map((item) => [item.menuItemId, item]));
      const priceByItem = new Map(prices.map((price) => [price.menuItemId, price]));
      const recipeByItem = new Map(recipes.map((recipe) => [recipe.menuItemId, recipe]));
      if (
        itemIds.some((id) => !publication.has(id) || !priceByItem.has(id) || !recipeByItem.has(id))
      )
        throw new CatalogueSnapshotMissing();

      const recipeIds = recipes.map((recipe) => recipe.id);
      const [recipeLines, materialCosts] = await Promise.all([
        recipeIds.length
          ? tx
              .select()
              .from(tables.recipeLines)
              .where(inArray(tables.recipeLines.recipeId, recipeIds))
          : Promise.resolve([]),
        tx
          .select()
          .from(tables.materialCosts)
          .where(
            and(
              eq(tables.materialCosts.tenantId, input.tenantId),
              isNull(tables.materialCosts.validTo),
            ),
          ),
      ]);
      const costByMaterial = new Map(
        materialCosts.map((cost) => [cost.materialId, cost.costPerUnit]),
      );

      const businessDate = sql`(now() AT TIME ZONE 'Africa/Cairo')::date`;
      const seq = await tx.execute<{ seq: number }>(sql`
        INSERT INTO order_number_counters (tenant_id, business_date, next_seq)
        VALUES (${input.tenantId}, (now() AT TIME ZONE 'Africa/Cairo')::date, 2)
        ON CONFLICT (tenant_id, business_date)
          DO UPDATE SET next_seq = order_number_counters.next_seq + 1
        RETURNING next_seq - 1 AS seq
      `);
      const takenSeq = Number(seq.rows[0]?.seq ?? 0);
      if (!takenSeq) throw new Error('Order number sequence returned no value.');
      // The number staff shout across the counter; it resets each Cairo day.
      const orderNumber = `A-${String(takenSeq).padStart(3, '0')}`;

      const [order] = await tx
        .insert(tables.orders)
        .values({
          tenantId: input.tenantId,
          orderNumber,
          businessDate,
          channel: 'whatsapp',
          customerId: input.customerId,
          tableLabel: input.tableLabel,
          customerNote: input.customerNote,
          status: 'placed',
          subtotalMinor: input.cart.subtotalMinor,
          discountMinor: input.cart.discountMinor,
          totalMinor: input.cart.totalMinor,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      if (!order) throw new Error('Order insert returned no row.');

      for (const line of input.cart.lines) {
        const item = publication.get(line.menuItemId);
        const price = priceByItem.get(line.menuItemId);
        const recipe = recipeByItem.get(line.menuItemId);
        if (!item || !price || !recipe) throw new CatalogueSnapshotMissing();
        const [orderItem] = await tx
          .insert(tables.orderItems)
          .values({
            tenantId: input.tenantId,
            orderId: order.id,
            menuItemId: line.menuItemId,
            qty: line.qty,
            unitPriceMinor: line.unitPriceMinor,
            modifierTotalMinor: line.modifierTotalMinor,
            lineTotalMinor: line.lineTotalMinor,
            costSnapshotMinor: recipeCostMinor(
              recipe.id,
              line.qty,
              line.modifiers.map((modifier) => modifier.id),
              recipeLines,
              costByMaterial,
            ),
            recipeVersionId: recipe.id,
            menuPriceVersionId: price.id,
            nameSnapshotEn: item.nameEn,
            nameSnapshotAr: item.nameAr,
          })
          .returning();
        if (!orderItem) throw new Error('Order item insert returned no row.');
        if (line.modifiers.length) {
          const names = await tx
            .select()
            .from(tables.menuVersionModifierOptions)
            .where(
              and(
                eq(tables.menuVersionModifierOptions.tenantId, input.tenantId),
                eq(tables.menuVersionModifierOptions.menuVersionId, input.menuVersionId),
              ),
            );
          const nameById = new Map(names.map((option) => [option.modifierOptionId, option]));
          await tx.insert(tables.orderItemModifiers).values(
            line.modifiers.map((modifier) => {
              const snapshot = nameById.get(modifier.id);
              if (!snapshot) throw new CatalogueSnapshotMissing();
              return {
                tenantId: input.tenantId,
                orderItemId: orderItem.id,
                modifierOptionId: modifier.id,
                nameSnapshotEn: snapshot.nameEn,
                nameSnapshotAr: snapshot.nameAr,
                priceDeltaMinor: modifier.waivedByTier ? 0 : modifier.priceDeltaMinor,
              };
            }),
          );
        }
      }

      await tx.insert(tables.orderEvents).values({
        tenantId: input.tenantId,
        orderId: order.id,
        fromStatus: null,
        toStatus: 'placed',
        actorType: 'customer',
        actorId: input.customerId,
        source: 'webview',
      });

      const response = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'placed' as const,
        totalMinor: order.totalMinor,
        payAt: input.responseSeed.payAt,
        eta: input.responseSeed.eta,
        loyalty: input.responseSeed.loyalty,
        placedAt: order.createdAt.toISOString(),
        traceId: input.responseSeed.traceId,
      };
      await tx
        .update(tables.orders)
        .set({ placementResponse: response })
        .where(eq(tables.orders.id, order.id));

      return {
        order: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: 'placed',
          totalMinor: order.totalMinor,
          subtotalMinor: order.subtotalMinor,
          placedAt: order.createdAt.toISOString(),
        },
        response,
        replayed: false,
      };
    });
  }
}

/** Converts NUMERIC(14,6) values without float arithmetic before storing piastres. */
function recipeCostMinor(
  recipeId: string,
  quantity: number,
  modifierIds: readonly string[],
  recipeLines: readonly {
    recipeId: string;
    materialId: string;
    qty: string;
    modifierOptionId: string | null;
  }[],
  costByMaterial: ReadonlyMap<string, string>,
): number {
  const selected = new Set(modifierIds);
  const million = 1_000_000n;
  let scaledCost = 0n;
  for (const line of recipeLines) {
    if (
      line.recipeId !== recipeId ||
      (line.modifierOptionId && !selected.has(line.modifierOptionId))
    )
      continue;
    const cost = costByMaterial.get(line.materialId);
    if (!cost) throw new CatalogueSnapshotMissing();
    scaledCost += decimalScaled(line.qty) * decimalScaled(cost);
  }
  const piastres =
    (scaledCost * BigInt(quantity) * 100n + (million * million) / 2n) / (million * million);
  if (piastres > BigInt(Number.MAX_SAFE_INTEGER)) throw new CatalogueSnapshotMissing();
  return Number(piastres);
}

function decimalScaled(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  const digits = `${fraction}000000`.slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(digits);
}
