-- F2 KDS: active_stations (FR-3.10), feeds FR-2.19's ETA queue-depth input.
-- One row per tenant - operational state, not audit history. RLS and grants
-- are applied generically by the existing post/ scripts (0010_grants.sql,
-- 0030_rls.sql) on any fresh apply, since this table's PK column is
-- literally named tenant_id like every other table's tenant scoping column.

CREATE TABLE "kitchen_state" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id"),
  "active_stations" integer NOT NULL DEFAULT 1 CHECK ("active_stations" BETWEEN 1 AND 12),
  "updated_at" timestamptz NOT NULL,
  "updated_by_staff_id" uuid
);
