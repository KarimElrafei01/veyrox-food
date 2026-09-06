-- F1.7 order status: the customer-facing rejection reason and its timestamp.
-- Written by kitchen reject (F2); read by `GET /public/orders/:orderId/status`.
-- Expand-only; nullable, no backfill.

ALTER TABLE "orders" ADD COLUMN "rejection_reason" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejected_at" timestamptz;
