import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

/**
 * Integration tests run against a real Postgres (docs/07 §4) — RLS, triggers,
 * SERIALIZABLE and partial unique indexes do not exist in a fake. Each suite gets
 * its own throwaway database created from the admin connection.
 */
const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/veyrox_food';

export interface TestDatabase {
  /** Connection string for the app role (RLS applies). */
  appUrl: string;
  /** Connection string for the owner/admin role (migrations, bootstrap). */
  adminUrl: string;
  drop: () => Promise<void>;
}

export function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export async function provisionTestDatabase(): Promise<TestDatabase> {
  const name = `veyrox_test_${randomBytes(6).toString('hex')}`;
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  // The app role must be able to read/write its own tables; RLS still constrains it.
  const bootstrap = new Client({ connectionString: withDatabaseName(ADMIN_URL, name) });
  await bootstrap.connect();
  await bootstrap.query('GRANT ALL ON SCHEMA public TO veyroxai_app');
  await bootstrap.end();

  return {
    appUrl: withDatabaseName(
      process.env.DATABASE_URL ?? 'postgres://veyroxai_app:veyroxai_app@localhost:5432/veyrox_food',
      name,
    ),
    adminUrl: withDatabaseName(ADMIN_URL, name),
    drop: async () => {
      const client = new Client({ connectionString: ADMIN_URL });
      await client.connect();
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [name],
      );
      await client.query(`DROP DATABASE IF EXISTS ${name}`);
      await client.end();
    },
  };
}
