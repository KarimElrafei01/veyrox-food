import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { provisionTestDatabase, type TestDatabase } from '@veyroxai/testkit';
import { runMigrations } from '../migrate.js';
import { seedTenantGraph } from './graph.js';

/**
 * material_ledger and order_events are append-only, protected by both a trigger
 * and a REVOKE (docs/04 §2). Assert the app role cannot mutate a row it can see.
 */
describe('append-only ledger and events', () => {
  let harness: TestDatabase;
  let appPool: Pool;
  let tenantId: string;

  beforeAll(async () => {
    harness = await provisionTestDatabase();
    await runMigrations(harness.adminUrl);
    const adminPool = new Pool({ connectionString: harness.adminUrl });
    tenantId = await seedTenantGraph(adminPool, 'tenant-a');
    await adminPool.end();
    appPool = new Pool({ connectionString: harness.appUrl });
  }, 60_000);

  afterAll(async () => {
    await appPool?.end();
    await harness?.drop();
  });

  async function attempt(sql: string): Promise<void> {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      await client.query(sql);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }

  it('rejects UPDATE on material_ledger', async () => {
    await expect(attempt(`UPDATE material_ledger SET note = 'x'`)).rejects.toThrow();
  });

  it('rejects DELETE on material_ledger', async () => {
    await expect(attempt(`DELETE FROM material_ledger`)).rejects.toThrow();
  });

  it('rejects UPDATE on order_events', async () => {
    await expect(attempt(`UPDATE order_events SET reason = 'x'`)).rejects.toThrow();
  });
});
