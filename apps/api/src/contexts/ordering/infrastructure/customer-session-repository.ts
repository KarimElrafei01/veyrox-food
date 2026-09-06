import { and, eq, gte, withTenant, type Database, tables } from '@veyroxai/db';

export class CustomerSessionRepository {
  constructor(private readonly db: Database) {}

  async load(
    tenantId: string,
    customerId: string,
    menuVersionId: string,
  ): Promise<{
    tenant: typeof tables.tenants.$inferSelect;
    customer: typeof tables.customers.$inferSelect;
    menuVersion: typeof tables.menuVersions.$inferSelect;
    hours: Array<typeof tables.storeHours.$inferSelect>;
    closures: Array<typeof tables.storeClosures.$inferSelect>;
    abandonedOrderCount: number;
    orderingEnabled: boolean;
    orderingDisabledReason: 'platform_disabled' | 'not_entitled' | 'owner_disabled';
  } | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      const [tenant] = await tx
        .select()
        .from(tables.tenants)
        .where(eq(tables.tenants.id, tenantId));
      const [customer] = await tx
        .select()
        .from(tables.customers)
        .where(and(eq(tables.customers.id, customerId), eq(tables.customers.tenantId, tenantId)));
      const [menuVersion] = await tx
        .select()
        .from(tables.menuVersions)
        .where(
          and(
            eq(tables.menuVersions.id, menuVersionId),
            eq(tables.menuVersions.tenantId, tenantId),
          ),
        );
      if (!tenant || !customer || !menuVersion) return null;
      const [hours, closures, abandonedOrders] = await Promise.all([
        tx.select().from(tables.storeHours).where(eq(tables.storeHours.tenantId, tenantId)),
        tx.select().from(tables.storeClosures).where(eq(tables.storeClosures.tenantId, tenantId)),
        tx
          .select({ id: tables.orders.id })
          .from(tables.orders)
          .where(
            and(
              eq(tables.orders.tenantId, tenantId),
              eq(tables.orders.customerId, customerId),
              eq(tables.orders.status, 'abandoned'),
              gte(tables.orders.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
            ),
          ),
      ]);
      return {
        tenant,
        customer,
        menuVersion,
        hours,
        closures,
        abandonedOrderCount: abandonedOrders.length,
        // Platform configuration is introduced in F7; until then the accepted
        // default is enabled and the resolver is deliberately the only seam.
        orderingEnabled: true,
        orderingDisabledReason: 'owner_disabled',
      };
    });
  }
}
