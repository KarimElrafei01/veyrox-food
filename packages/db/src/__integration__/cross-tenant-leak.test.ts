import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { provisionTestDatabase, type TestDatabase } from '@veyroxai/testkit';
import { runMigrations } from '../migrate.js';
import { allTables } from '../tables.js';
import { seedTenantGraph } from './graph.js';

/**
 * The real deliverable of ADR-0008. Two full tenant graphs; tenant A's connection
 * must return A's rows and zero of B's, from every table. Runs on every merge.
 */
describe('cross-tenant isolation', () => {
  let harness: TestDatabase;
  let appPool: Pool;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    harness = await provisionTestDatabase();
    await runMigrations(harness.adminUrl);

    const adminPool = new Pool({ connectionString: harness.adminUrl });
    tenantA = await seedTenantGraph(adminPool, 'tenant-a');
    tenantB = await seedTenantGraph(adminPool, 'tenant-b');
    await adminPool.end();

    appPool = new Pool({ connectionString: harness.appUrl });
  }, 60_000);

  afterAll(async () => {
    await appPool?.end();
    await harness?.drop();
  });

  async function countUnder(tenantId: string | null, table: string): Promise<number> {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const res = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
      await client.query('ROLLBACK');
      return res.rows[0].n as number;
    } finally {
      client.release();
    }
  }

  const tableNames = allTables().map((t) => t.name);

  it.each(tableNames)('%s is scoped to the active tenant', async (table) => {
    expect(await countUnder(tenantA, table)).toBe(1);
    expect(await countUnder(tenantB, table)).toBe(1);
    // Deny by default: no tenant set → no rows.
    expect(await countUnder(null, table)).toBe(0);
  });

  it('the two tenants are distinct', () => {
    expect(tenantA).not.toBe(tenantB);
  });
});
