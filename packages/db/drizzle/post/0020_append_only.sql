-- Append-only enforcement on the ledger and the event log (docs/04 §2, §7;
-- CLAUDE.md — Non-negotiables). TWO independent mechanisms, deliberately:
--   1. a BEFORE UPDATE OR DELETE trigger that raises, and
--   2. REVOKE UPDATE, DELETE from the app role.
-- Either alone would be enough; both together mean a bug in one does not open a
-- hole in the invariant everything else rests on.
CREATE OR REPLACE FUNCTION reject_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: % is not permitted', TG_TABLE_NAME, TG_OP;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER material_ledger_append_only
  BEFORE UPDATE OR DELETE ON material_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER order_events_append_only
  BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

REVOKE UPDATE, DELETE ON material_ledger FROM veyroxai_app;
REVOKE UPDATE, DELETE ON order_events FROM veyroxai_app;
