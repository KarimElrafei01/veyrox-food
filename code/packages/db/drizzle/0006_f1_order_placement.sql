ALTER TABLE "orders" ADD COLUMN "customer_note" text;
--> statement-breakpoint
CREATE INDEX "orders_open_customer_idx" ON "orders" USING btree ("tenant_id", "customer_id", "status") WHERE status IN ('placed', 'received', 'preparing', 'ready');
