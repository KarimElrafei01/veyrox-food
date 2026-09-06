import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { schema } from './schema/index.js';

export interface TableRef {
  name: string;
  table: PgTable;
}

/** Every physical table in the schema, derived from the Drizzle objects so a new
 *  table is automatically in scope for the cross-tenant leak suite (ADR-0008). */
export function allTables(): TableRef[] {
  const refs: TableRef[] = [];
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) {
      refs.push({ name: getTableName(value), table: value });
    }
  }
  return refs;
}
