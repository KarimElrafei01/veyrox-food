/**
 * Reprint fresh 24h customer session tokens for the Brew & Baladi fixture, without
 * re-seeding or publishing a new menu version. Also prints a fresh KDS staff
 * session (device + PIN token) - the F2 frontend's dev-only entry path until the
 * real S2-S5 enrollment/PIN realm exists (frontend-implementation.md's
 * 2026-09-12 scope-correction note): paste the printed `loginUrl` into the KDS
 * app once, which stores both tokens in localStorage (ops-core's
 * bootstrapStaffSessionFromUrl).
 *
 *   pnpm --filter @veyroxai/api tokens
 *
 * Reads DATABASE_ADMIN_URL, SESSION_KEY, STAFF_DEVICE_JWT_KEY, and
 * STAFF_PIN_TOKEN_KEY from .env. Run `pnpm --filter @veyroxai/api fixture` first
 * (once) to create the customers and a menu version.
 */
import { createDatabase, createPool, desc, eq, tables } from '@veyroxai/db';
import { randomUUID } from 'node:crypto';
import {
  mintCustomerSession,
  mintDeviceJwt,
  mintPinActionToken,
} from '../contexts/identity/domain/index.js';

const SLUG = 'brew-and-baladi';
const KDS_APP_URL = process.env.KDS_APP_URL ?? 'http://localhost:3003';

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is not set (check .env)');
  const sessionKey = process.env.SESSION_KEY ?? 'dev-session-key';
  const deviceJwtKey = process.env.STAFF_DEVICE_JWT_KEY;
  if (!deviceJwtKey) throw new Error('STAFF_DEVICE_JWT_KEY is not set (check .env)');
  const pinTokenKey = process.env.STAFF_PIN_TOKEN_KEY;
  if (!pinTokenKey) throw new Error('STAFF_PIN_TOKEN_KEY is not set (check .env)');
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
    // Device token: a stable per-tablet identity, given the same 24h life as a
    // customer session for dev convenience. PIN token: ADR-0023's real 15min
    // action-token lifetime, deliberately not loosened - a dev token that never
    // expires would never exercise real re-entry behavior.
    const deviceId = 'dev-kds-1';
    const staffId = randomUUID();
    const pinExp = iat + 900;
    const deviceToken = mintDeviceJwt(
      { tenantId: tenant.id, deviceId, deviceKind: 'kds', issuedAt: iat, expiresAt: exp },
      deviceJwtKey,
    );
    const pinToken = mintPinActionToken(
      { tenantId: tenant.id, deviceId, staffId, issuedAt: iat, expiresAt: pinExp },
      pinTokenKey,
    );
    out.kdsStaffSession = {
      deviceId,
      staffId,
      deviceTokenExpiresAt: new Date(exp * 1000).toISOString(),
      pinTokenExpiresAt: new Date(pinExp * 1000).toISOString(),
      deviceToken,
      pinToken,
      loginUrl: `${KDS_APP_URL}/?device=${encodeURIComponent(deviceToken)}&pin=${encodeURIComponent(pinToken)}`,
    };

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
