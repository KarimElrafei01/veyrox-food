import { eq, withTenant, type Database, tables } from '@veyroxai/db';

/**
 * F2 backend doc §5. A plain per-tenant row, not an order-lifecycle fact - no
 * order_events row, no idempotency-key dedup table. Setting `activeStations`
 * is naturally idempotent (an upsert to the same value twice is a no-op in
 * effect), unlike Accept's ledger write, so it doesn't need Accept's heavier
 * replay machinery to satisfy "replaying a request never double-executes a
 * side effect" - there is no side effect here beyond the value itself.
 */
export class KitchenStateRepository {
  constructor(private readonly db: Database) {}

  async setActiveStations(input: {
    tenantId: string;
    activeStations: number;
    staffId: string;
    now: Date;
  }): Promise<{ activeStations: number; updatedAt: Date }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      const [row] = await tx
        .insert(tables.kitchenState)
        .values({
          tenantId: input.tenantId,
          activeStations: input.activeStations,
          updatedAt: input.now,
          updatedByStaffId: input.staffId,
        })
        .onConflictDoUpdate({
          target: tables.kitchenState.tenantId,
          set: {
            activeStations: input.activeStations,
            updatedAt: input.now,
            updatedByStaffId: input.staffId,
          },
        })
        .returning();
      if (!row) throw new Error('kitchen_state upsert returned no row.');
      return { activeStations: row.activeStations, updatedAt: row.updatedAt };
    });
  }

  async loadActiveStations(tenantId: string): Promise<number> {
    return withTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select({ activeStations: tables.kitchenState.activeStations })
        .from(tables.kitchenState)
        .where(eq(tables.kitchenState.tenantId, tenantId));
      return row?.activeStations ?? 1;
    });
  }
}
