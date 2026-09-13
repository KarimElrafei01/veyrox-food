-- Same situation 0060_order_number_counters_rls.sql documents: on a database
-- migrated before 0011_tenant_settings.sql existed, 0030_rls.sql's loop already
-- ran and did not cover `tenant_settings`; this adds its policy. On a fresh
-- database 0030 picks the table up in the same run and this is a no-op — hence
-- the `DROP POLICY IF EXISTS`. Plain tenant-isolation shape; deny-by-default
-- when unset.
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_settings;
CREATE POLICY tenant_isolation ON tenant_settings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_settings TO veyroxai_app;
