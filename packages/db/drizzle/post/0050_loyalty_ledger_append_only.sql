-- Loyalty corrections are compensating rows. Updating a balance would erase the
-- evidence needed to explain a clawback or investigate INV-4.
CREATE TRIGGER loyalty_ledger_append_only
  BEFORE UPDATE OR DELETE ON loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

REVOKE UPDATE, DELETE ON loyalty_ledger FROM veyroxai_app;
