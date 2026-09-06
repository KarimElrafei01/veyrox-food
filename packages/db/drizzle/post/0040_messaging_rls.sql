-- Webhook rows arrive before their tenant is known. The worker resolves the
-- phone-number mapping after the edge dedupe, so NULL tenant rows are the one
-- deliberate exception to ordinary tenant-scoped access.
ALTER TABLE inbound_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_events;
CREATE POLICY inbound_event_edge_and_worker_access ON inbound_events
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)::uuid
  );
