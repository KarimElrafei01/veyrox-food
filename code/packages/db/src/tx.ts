import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

/**
 * Run `fn` inside a transaction scoped to one tenant. `SET LOCAL app.tenant_id`
 * is what every RLS policy reads (ADR-0008); no client ever connects to Postgres,
 * so this is the single place the tenant claim enters the database (ADR-0002).
 *
 * Second caller after `apps/api` is the integration test suite — which is why this
 * lives in the package rather than in the API (CLAUDE.md — rule of three).
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
