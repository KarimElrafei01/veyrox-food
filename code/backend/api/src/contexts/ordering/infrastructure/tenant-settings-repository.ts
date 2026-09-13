import { and, eq, withTenant, type Database, tables } from '@veyroxai/db';
import type { SettingDefinition } from '@veyroxai/domain';

/**
 * ADR-0024's narrow stand-in for the real `resolveFeature()` (ADR-0015) - one
 * boolean Layer-3 preference, read straight from `tenant_settings`, falling
 * back to the definition's own default when the café has never set it.
 * `definition` plays the role a `setting_definitions` row would once that
 * table is real (Sprint 6-7); "a key absent from the registry cannot be set
 * by anyone" holds today because there is no other way to read a key that
 * isn't a `KNOWN_SETTINGS` entry - this function's caller always passes one.
 */
export async function getBooleanTenantSetting(
  db: Database,
  tenantId: string,
  definition: SettingDefinition<boolean>,
): Promise<boolean> {
  return withTenant(db, tenantId, async (tx) => {
    const row = await tx.query.tenantSettings.findFirst({
      where: and(
        eq(tables.tenantSettings.tenantId, tenantId),
        eq(tables.tenantSettings.key, definition.key),
      ),
    });
    if (!row) return definition.defaultValue;
    // jsonb round-trips `true`/`false` faithfully when written through this
    // same reader's sibling setter, but a value hand-edited outside the app
    // must never crash a placement request - fall back to the default instead.
    return typeof row.value === 'boolean' ? row.value : definition.defaultValue;
  });
}
