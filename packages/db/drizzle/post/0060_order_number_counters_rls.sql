-- `order_number_counters` was added after 0030_rls.sql ran its one-time loop, so it
-- needs its policy spelled out here. Same tenant-isolation shape as every other
-- table; deny-by-default when `app.tenant_id` is unset.
ALTER TABLE order_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_number_counters
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON order_number_counters TO veyroxai_app;
