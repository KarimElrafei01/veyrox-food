-- Runs once on an empty data directory (docker-entrypoint-initdb.d).
-- Mirrors the roles we run with on Neon: the app never connects as a superuser,
-- and the habit rail has its own role with almost no grant (ADR-0002, ADR-0003,
-- docs/10-risk-containment.md).

-- The application role. RLS applies to it; it is NOT a superuser and does NOT
-- bypass row-level security.
CREATE ROLE veyroxai_app WITH LOGIN PASSWORD 'veyroxai_app' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE veyrox_food TO veyroxai_app;

-- The habit rail's read-only role. It is granted SELECT on exactly one view and
-- nothing else, ever (added when vw_habit_targets ships in Sprint 10).
CREATE ROLE habit_reader WITH LOGIN PASSWORD 'habit_reader' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE veyrox_food TO habit_reader;

\connect veyrox_food

-- Schema-level grants. Table grants are issued by the migration bootstrap so they
-- track the schema (docs/04-data-model.md §13).
GRANT USAGE ON SCHEMA public TO veyroxai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO veyroxai_app;
