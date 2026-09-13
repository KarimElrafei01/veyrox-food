import { jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, ts } from './_shared.js';
import { tenants } from './tenants.js';

/**
 * ADR-0015 §B / `13-admin-and-configuration.md` §9, Layer 3 only. A café's own
 * chosen value for a setting - `kitchen.auto_accept` (ADR-0024) is the first
 * real row this table holds. `setting_definitions` (the registry these keys
 * are checked against) is deliberately not added yet - see ADR-0024's
 * Alternatives; `@veyroxai/domain`'s `KNOWN_SETTINGS` stands in for it.
 * A key absent from that constant cannot be set by anyone (CLAUDE.md), same
 * rule as the real registry will enforce once it exists.
 */
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedByType: text('updated_by_type'), // staff | system | platform
    updatedById: uuid('updated_by_id'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tenant_settings_tenant_key_idx').on(t.tenantId, t.key)],
);
