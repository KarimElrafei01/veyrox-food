import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({ connectionString, max: 10 });
}

export function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}
