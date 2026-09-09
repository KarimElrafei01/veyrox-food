import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Forward-only, expand/contract migrations (CLAUDE.md — Conventions). Applied in
 * three ordered phases so the hand-written SQL brackets the generated schema:
 *
 *   pre/   prerequisites the generated tables depend on (uuid_generate_v7)
 *   *.sql  drizzle-kit generated schema, lexicographic
 *   post/  RLS policies, append-only triggers, updated_at triggers, grants
 *
 * Runs with the admin/owner connection; the app role never migrates.
 */
async function sqlFilesIn(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function runMigrations(connectionString?: string): Promise<string[]> {
  const url =
    connectionString ??
    process.env.DATABASE_ADMIN_URL ??
    'postgres://postgres:postgres@localhost:5432/veyrox_food';
  const client = new Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS __manual_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = [
      ...(await sqlFilesIn(path.join(MIGRATIONS_DIR, 'pre'))),
      ...(await sqlFilesIn(MIGRATIONS_DIR)),
      ...(await sqlFilesIn(path.join(MIGRATIONS_DIR, 'post'))),
    ];

    for (const file of files) {
      const key = path.relative(MIGRATIONS_DIR, file).replace(/\\/g, '/');
      const seen = await client.query('SELECT 1 FROM __manual_migrations WHERE filename = $1', [
        key,
      ]);
      if (seen.rowCount) {
        continue;
      }
      const sqlText = await readFile(file, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sqlText);
        await client.query('INSERT INTO __manual_migrations (filename) VALUES ($1)', [key]);
        await client.query('COMMIT');
        applied.push(key);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${key} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  runMigrations()
    .then((applied) => {
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Already up to date');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
