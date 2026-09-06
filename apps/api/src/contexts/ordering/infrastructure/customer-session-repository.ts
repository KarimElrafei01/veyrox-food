import { and, eq, withTenant, type Database, tables } from '@veyroxai/db';

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
      return tenant && customer && menuVersion ? { tenant, customer, menuVersion } : null;
    });
  }
}
