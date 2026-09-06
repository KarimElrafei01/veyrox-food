-- On a database migrated before 0007 existed, 0030_rls.sql's loop already ran and
-- did not cover `order_number_counters`; this adds its policy. On a fresh database
-- 0030 picks the table up in the same run and this is a no-op — hence the
-- `DROP POLICY IF EXISTS`. Same tenant-isolation shape; deny-by-default when unset.
ALTER TABLE order_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON order_number_counters;
CREATE POLICY tenant_isolation ON order_number_counters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON order_number_counters TO veyroxai_app;
