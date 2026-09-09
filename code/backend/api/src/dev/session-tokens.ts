/**
 * Reprint fresh 24h customer session tokens for the Brew & Baladi fixture, without
 * re-seeding or publishing a new menu version.
 *
 *   pnpm --filter @veyroxai/api tokens
 *
 * Reads DATABASE_ADMIN_URL and SESSION_KEY from .env. Run `pnpm --filter
 * @veyroxai/api fixture` first (once) to create the customers and a menu version.
 */
import { createDatabase, createPool, desc, eq, tables } from '@veyroxai/db';
import { mintCustomerSession } from '../contexts/identity/domain/index.js';

const SLUG = 'brew-and-baladi';

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is not set (check .env)');
  const sessionKey = process.env.SESSION_KEY ?? 'dev-session-key';
  const pool = createPool(adminUrl);
  const db = createDatabase(pool);

  try {
    const [tenant] = await db.select().from(tables.tenants).where(eq(tables.tenants.slug, SLUG));
    if (!tenant)
      throw new Error(`No "${SLUG}" tenant — run \`pnpm --filter @veyroxai/api fixture\`.`);

    const [menuVersion] = await db
      .select()
      .from(tables.menuVersions)
      .where(eq(tables.menuVersions.tenantId, tenant.id))
      .orderBy(desc(tables.menuVersions.publishedAt))
      .limit(1);
    if (!menuVersion) throw new Error('No published menu version — run the fixture.');

    const customers = await db
      .select()
      .from(tables.customers)
      .where(eq(tables.customers.tenantId, tenant.id));

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 24 * 3600;

    const out: Record<string, unknown> = {
      tenantId: tenant.id,
      menuVersionId: menuVersion.id,
      sessionKey,
      expiresAt: new Date(exp * 1000).toISOString(),
      tokens: {},
    };
    for (const customer of customers.sort((a, b) => (a.phoneHash < b.phoneHash ? -1 : 1))) {
      const tier = (
        ['bronze', 'silver', 'gold'].includes(customer.tier) ? customer.tier : 'bronze'
      ) as 'bronze' | 'silver' | 'gold';
      (out.tokens as Record<string, unknown>)[customer.displayName ?? customer.phoneHash] = {
        customerId: customer.id,
        tier,
        token: mintCustomerSession(
          {
            tenantId: tenant.id,
            customerId: customer.id,
            waId: customer.waId ?? '20100000000',
            menuVersionId: menuVersion.id,
            tier,
            locale: 'en',
            issuedAt: iat,
            expiresAt: exp,
          },
          sessionKey,
        ),
      };
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
