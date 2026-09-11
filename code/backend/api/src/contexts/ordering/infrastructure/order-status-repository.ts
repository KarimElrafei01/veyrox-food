import { and, eq, withTenant, type Database, tables } from '@veyroxai/db';

export interface OwnedOrderRow {
  orderId: string;
  orderNumber: string;
  status: string;
  totalMinor: number;
  promisedEtaLowerAt: Date | null;
  promisedEtaUpperAt: Date | null;
  placedAt: Date;
  acceptedAt: Date | null;
  readyAt: Date | null;
  collectedAt: Date | null;
  rejectionReason: string | null;
  rejectedAt: Date | null;
  // Prep time per line, read live off the menu item (same source the queue rebuild
  // uses) — order_items has no prep-time snapshot column, so a later menu edit can
  // nudge this, same as it already can for an order still sitting in the queue.
  etaItems: { prepSeconds: number }[];
}

/** F1.7 §5: one primary-key lookup with the ownership predicate from the token.
 *  A row for another customer comes back as `null` — never a 403 (F1.7 §6). */
export class OrderStatusRepository {
  constructor(private readonly db: Database) {}

  async findOwnedOrder(
    tenantId: string,
    customerId: string,
    orderId: string,
  ): Promise<OwnedOrderRow | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      const row = await tx.query.orders.findFirst({
        where: and(
          eq(tables.orders.id, orderId),
          eq(tables.orders.tenantId, tenantId),
          eq(tables.orders.customerId, customerId),
        ),
      });
      if (!row) return null;
      const items = await tx
        .select({ prepSeconds: tables.menuItems.basePrepSeconds })
        .from(tables.orderItems)
        .innerJoin(tables.menuItems, eq(tables.menuItems.id, tables.orderItems.menuItemId))
        .where(
          and(eq(tables.orderItems.orderId, row.id), eq(tables.orderItems.tenantId, tenantId)),
        );
      return {
        orderId: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        totalMinor: row.totalMinor,
        promisedEtaLowerAt: row.promisedEtaLowerAt,
        promisedEtaUpperAt: row.promisedEtaUpperAt,
        placedAt: row.createdAt,
        acceptedAt: row.acceptedAt,
        readyAt: row.readyAt,
        collectedAt: row.collectedAt,
        rejectionReason: row.rejectionReason,
        rejectedAt: row.rejectedAt,
        etaItems: items,
      };
    });
  }
}
