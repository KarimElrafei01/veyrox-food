-- The app role gets DML on every table; RLS (0030) then constrains it to its
-- tenant. DDL stays with the migrating role only (ADR-0002, docs/04 §13).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO veyroxai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO veyroxai_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO veyroxai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO veyroxai_app;
