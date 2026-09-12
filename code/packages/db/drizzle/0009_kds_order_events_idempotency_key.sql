-- F2 KDS mutation dedup (backend doc §2.2): accept/reject/advance/revert/item-tick
-- each append one order_events row carrying the request's Idempotency-Key. A
-- concurrent duplicate's insert hits this unique index and rolls back its whole
-- transaction (ledger writes included) rather than double-executing.
-- Expand-only; nullable, no backfill — existing rows have no idempotency key.

ALTER TABLE "order_events" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "order_events_tenant_idempotency_idx" ON "order_events" USING btree ("tenant_id","idempotency_key") WHERE idempotency_key IS NOT NULL;
