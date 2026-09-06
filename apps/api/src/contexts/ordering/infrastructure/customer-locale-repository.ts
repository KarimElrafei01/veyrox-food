import { and, eq, sql, withTenant, type Database, tables } from '@veyroxai/db';

export class CustomerLocaleRepository {
  constructor(private readonly db: Database) {}

  async update(input: {
    tenantId: string;
    customerId: string;
    idempotencyKey: string;
    locale: 'en' | 'ar-EG';
    sequence: number;
  }): Promise<{ locale: 'en' | 'ar-EG'; sequence: number; replayed: boolean }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      // A per-customer transaction lock makes sequence comparison race-free.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:${input.customerId}:locale`}))`,
      );
      const existing = await tx.query.customerLocaleChanges.findFirst({
        where: and(
          eq(tables.customerLocaleChanges.tenantId, input.tenantId),
          eq(tables.customerLocaleChanges.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existing)
        return {
          locale: existing.locale as 'en' | 'ar-EG',
          sequence: existing.sequence,
          replayed: true,
        };

      const customer = await tx.query.customers.findFirst({
        where: and(
          eq(tables.customers.tenantId, input.tenantId),
          eq(tables.customers.id, input.customerId),
        ),
      });
      if (!customer) throw new CustomerLocaleNotFound();
      const applied = input.sequence > customer.localeVersion;
      const locale = applied ? input.locale : (customer.locale as 'en' | 'ar-EG');
      const sequence = applied ? input.sequence : customer.localeVersion;
      if (applied)
        await tx
          .update(tables.customers)
          .set({ locale, localeVersion: sequence, updatedAt: new Date() })
          .where(
            and(
              eq(tables.customers.tenantId, input.tenantId),
              eq(tables.customers.id, input.customerId),
            ),
          );
      await tx.insert(tables.customerLocaleChanges).values({
        tenantId: input.tenantId,
        customerId: input.customerId,
        idempotencyKey: input.idempotencyKey,
        locale,
        sequence,
      });
      return { locale, sequence, replayed: false };
    });
  }
}

export class CustomerLocaleNotFound extends Error {}
