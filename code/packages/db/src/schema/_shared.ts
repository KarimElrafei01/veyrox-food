import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Conventions from docs/04-data-model.md §2, applied to every table.
 *  - PK is uuid v7 (`uuid_generate_v7()` is created in the bootstrap migration).
 *  - Every table carries `tenant_id` (ADR-0008); the FK is attached per file to
 *    avoid a module cycle with `tenants`.
 *  - Timestamps are timestamptz, stored UTC.
 */
export const pk = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`);

export const tenantCol = () => uuid('tenant_id').notNull();

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const ts = (name: string) => timestamp(name, { withTimezone: true });
