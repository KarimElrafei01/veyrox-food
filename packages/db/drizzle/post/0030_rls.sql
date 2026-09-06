-- Row-level security on every table (ADR-0008, docs/04 §13). No client ever
-- connects to Postgres (ADR-0002), so this is defence in depth — but the day a
-- second café exists it is the only thing between two cafés' books, and the
-- cross-tenant leak suite asserts it holds on every merge.
--
-- The tenant claim arrives as `app.tenant_id`, set by the API (or a test) via
-- `SET LOCAL` inside the request transaction. A custom GUC that has been assigned
-- once in a session and then rolled back reads back as '' (empty string), not
-- NULL — and ''::uuid raises rather than denying. `NULLIF(..., '')` turns "no
-- tenant" into NULL so the `= ` comparison is NULL → false → deny by default.

-- `DROP POLICY IF EXISTS` first: a handful of tables carry an identical
-- `tenant_isolation` policy emitted by `drizzle-kit generate` (0001, 0002). This
-- file is the authority on the shape, and re-running it must be a no-op.

-- `tenants` is keyed by `id`, not `tenant_id`.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Every other table is scoped by tenant_id.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('tenants', '__manual_migrations')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;
