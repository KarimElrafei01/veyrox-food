import { and, desc, eq, gte, tables, type Database } from '@veyroxai/db';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { mintCustomerSession } from '../contexts/identity/domain/index.js';
import type { CatalogueRepository } from '../contexts/catalog/infrastructure/catalogue-repository.js';

/**
 * Dev-only. `GET /dev/sessions` lists every café and customer in the database with
 * a freshly minted 24h session token, so the webview can skip the WhatsApp QR/token
 * dance while testing (`DEV_LOGIN=1`). Registered by main.ts only when that flag is
 * set — it hands out impersonation tokens for every customer, so it must never be
 * enabled against a real tenant's data.
 */

const DEV_USER = z.object({
  customerId: z.uuid(),
  name: z.string(),
  tier: z.enum(['bronze', 'silver', 'gold']),
  token: z.string(),
});

const DEV_SESSIONS = z.object({
  cafes: z.array(
    z.object({
      tenantId: z.uuid(),
      name: z.string(),
      slug: z.string(),
      isDefault: z.boolean(),
      users: z.array(DEV_USER),
    }),
  ),
});

interface Deps {
  db: Database;
  sessionKey: string;
  catalogue: CatalogueRepository;
}

const DEFAULT_SLUG = 'brew-and-baladi';

export async function devSessionController(
  app: FastifyInstance,
  { db, sessionKey, catalogue }: Deps,
): Promise<void> {
  app.get('/dev/sessions', { schema: { response: { 200: DEV_SESSIONS } } }, async () => {
    const now = new Date();
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + 24 * 3600;

    const tenants = await db.select().from(tables.tenants);

    const cafes = await Promise.all(
      tenants.map(async (tenant) => {
        const [version] = await db
          .select({ id: tables.menuVersions.id })
          .from(tables.menuVersions)
          .where(
            and(
              eq(tables.menuVersions.tenantId, tenant.id),
              gte(tables.menuVersions.retainedUntil, now),
            ),
          )
          .orderBy(desc(tables.menuVersions.publishedAt))
          .limit(1);
        const menuVersionId = version?.id ?? (await catalogue.publish(tenant.id, now));

        const customers = await db
          .select()
          .from(tables.customers)
          .where(eq(tables.customers.tenantId, tenant.id))
          // Enough distinct sessions for a bounded concurrency test, while this
          // DEV_LOGIN-only endpoint remains capped instead of enumerating forever.
          .limit(100);

        return {
          tenantId: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          isDefault: tenant.slug === DEFAULT_SLUG,
          users: customers.map((customer) => {
            const tier = (['bronze', 'silver', 'gold'] as const).includes(
              customer.tier as 'bronze' | 'silver' | 'gold',
            )
              ? (customer.tier as 'bronze' | 'silver' | 'gold')
              : 'bronze';
            return {
              customerId: customer.id,
              name: customer.displayName ?? `Customer ${customer.id.slice(0, 6)}`,
              tier,
              token: mintCustomerSession(
                {
                  tenantId: tenant.id,
                  customerId: customer.id,
                  waId: customer.waId ?? `dev-${customer.id}`,
                  menuVersionId,
                  tier,
                  locale: 'en',
                  issuedAt,
                  expiresAt,
                },
                sessionKey,
              ),
            };
          }),
        };
      }),
    );

    return { cafes };
  });
}
