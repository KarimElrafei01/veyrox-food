-- ADR-0024: a real, tenant-scoped place for a café's own preference values.
-- `setting_definitions` (the registry these keys are checked against) is
-- deliberately not added yet - see that ADR's Alternatives; a code-level
-- constant (`@veyroxai/domain`'s KNOWN_SETTINGS) stands in for it, since no
-- console exists yet to read a shared registry from. RLS is added explicitly
-- in post/0080_tenant_settings_rls.sql (same reasoning as
-- post/0060_order_number_counters_rls.sql: on a database migrated before this
-- file existed, 0030_rls.sql's blanket loop already ran and won't retroactively
-- cover a table added later).

CREATE TABLE "tenant_settings" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by_type" text,
  "updated_by_id" uuid,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "tenant_settings_tenant_key_idx" ON "tenant_settings" ("tenant_id", "key");
