import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { provisionTestDatabase, type TestDatabase } from '@veyroxai/testkit';
import { createDatabase, createPool, runMigrations } from '@veyroxai/db';
import { KNOWN_SETTINGS } from '@veyroxai/domain';
import { getBooleanTenantSetting } from '../contexts/ordering/infrastructure/tenant-settings-repository.js';
import { seedOrderableTenant } from './seed.js';

describe('getBooleanTenantSetting — against real Postgres', () => {
  let harness: TestDatabase;
  let pool: Pool;
  let adminPool: Pool;
  let seed: Awaited<ReturnType<typeof seedOrderableTenant>>;

  beforeAll(async () => {
    harness = await provisionTestDatabase();
    await runMigrations(harness.adminUrl);
    adminPool = new Pool({ connectionString: harness.adminUrl });
    seed = await seedOrderableTenant(adminPool, 'tenant-settings');
    pool = createPool(harness.appUrl);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool?.end();
    await harness?.drop();
  });

  it('falls back to the definition default when the tenant never set the key', async () => {
    const database = createDatabase(pool);
    const value = await getBooleanTenantSetting(
      database,
      seed.tenantId,
      KNOWN_SETTINGS.kitchenAutoAccept,
    );
    expect(value).toBe(false);
  });

  it('returns the café-chosen value once one exists', async () => {
    await adminPool.query(
      `insert into tenant_settings (tenant_id, key, value) values ($1, $2, 'true'::jsonb)`,
      [seed.tenantId, KNOWN_SETTINGS.kitchenAutoAccept.key],
    );
    const database = createDatabase(pool);
    const value = await getBooleanTenantSetting(
      database,
      seed.tenantId,
      KNOWN_SETTINGS.kitchenAutoAccept,
    );
    expect(value).toBe(true);
  });

  it('never reads another tenant’s setting row (RLS)', async () => {
    // seed.tenantId has a `true` row from the previous test. A second,
    // untouched tenant must still read the definition default, not leak it.
    const otherSeed = await seedOrderableTenant(adminPool, 'tenant-settings-other');
    const database = createDatabase(pool);
    const value = await getBooleanTenantSetting(
      database,
      otherSeed.tenantId,
      KNOWN_SETTINGS.kitchenAutoAccept,
    );
    expect(value).toBe(false);
  });
});
