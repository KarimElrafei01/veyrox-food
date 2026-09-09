-- F1.6 order placement, part 2: the shouted daily order number and byte-identical
-- replay. Expand-only; `orders` has no rows yet, and the previous image never
-- wrote `business_date` or `placement_response`.

ALTER TABLE "orders" ADD COLUMN "business_date" date;
--> statement-breakpoint
UPDATE "orders"
  SET "business_date" = ("created_at" AT TIME ZONE 'Africa/Cairo')::date
  WHERE "business_date" IS NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "business_date" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "placement_response" jsonb;
--> statement-breakpoint

-- The shouted number resets every Cairo day, so it is only unique within one.
DROP INDEX IF EXISTS "orders_tenant_number_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_number_idx"
  ON "orders" USING btree ("tenant_id", "business_date", "order_number");
--> statement-breakpoint

CREATE TABLE "order_number_counters" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "business_date" date NOT NULL,
  "next_seq" integer NOT NULL DEFAULT 1,
  PRIMARY KEY ("tenant_id", "business_date")
);
