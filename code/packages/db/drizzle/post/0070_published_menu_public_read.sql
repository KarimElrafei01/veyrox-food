-- Menu-RLS decision, 2026-09-07 (option 1). The published menu is public by
-- design — ADR-0017 immutable publications, served at an unauthenticated URL and
-- addressed by an unguessable id. `CatalogueRepository.loadPublishedMenu` makes
-- exactly one unscoped read, of `menu_versions`, and then re-scopes to that
-- version's own tenant for every item/modifier row. So only this header table
-- opens up, and only for SELECT.
--
-- The header carries nothing sensitive (id, tenant_id, published_at,
-- retained_until). Costs, recipes, and material data are in separate tables that
-- keep their plain tenant_isolation policy. Publishing a menu still requires the
-- owning tenant's claim (the WITH CHECK below), and the child tables stay fully
-- isolated — code that reads them without going through loadPublishedMenu's
-- deliberate withTenant fails closed.
--
-- Idempotent: drop every policy name this file might have left, then recreate.

ALTER TABLE menu_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON menu_versions;
DROP POLICY IF EXISTS menu_versions_public_read ON menu_versions;
DROP POLICY IF EXISTS menu_versions_tenant_write ON menu_versions;

CREATE POLICY menu_versions_public_read ON menu_versions
  FOR SELECT
  USING (true);

CREATE POLICY menu_versions_tenant_write ON menu_versions
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
