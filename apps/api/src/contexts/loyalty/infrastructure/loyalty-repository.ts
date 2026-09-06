import { and, eq, withTenant, type Database, tables } from '@veyroxai/db';
import { previewPoints, tierForPoints, type LoyaltyTier } from '@veyroxai/domain';
import type { Minor } from '@veyroxai/domain';

export class LoyaltyRepository {
  constructor(private readonly db: Database) {}

  async accrue(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    totalMinor: Minor;
    tier: LoyaltyTier;
  }) {
    return withTenant(this.db, input.tenantId, async (tx) => {
      const [customer] = await tx
        .select()
        .from(tables.customers)
        .where(
          and(
            eq(tables.customers.id, input.customerId),
            eq(tables.customers.tenantId, input.tenantId),
          ),
        );
      if (!customer) throw new Error('Customer not found.');
      const points = previewPoints(input.totalMinor, input.tier).pointsToEarn;
      const previousTier = tierForPoints(customer.pointsCache);
      const nextBalance = customer.pointsCache + points;
      const nextTier = tierForPoints(nextBalance);
      await tx
        .insert(tables.loyaltyLedger)
        .values({
          tenantId: input.tenantId,
          customerId: input.customerId,
          delta: points,
          reason: 'order_accrual',
          orderId: input.orderId,
        });
      await tx
        .update(tables.customers)
        .set({ pointsCache: nextBalance, tier: nextTier })
        .where(eq(tables.customers.id, input.customerId));
      if (
        ['bronze', 'silver', 'gold'].indexOf(nextTier) >
        ['bronze', 'silver', 'gold'].indexOf(previousTier)
      ) {
        const cairoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(
          new Date(),
        );
        await tx
          .insert(tables.tierCelebrations)
          .values({
            tenantId: input.tenantId,
            customerId: input.customerId,
            tier: nextTier,
            cairoDate,
          })
          .onConflictDoNothing();
      }
      return { points, previousTier, nextTier };
    });
  }
}
