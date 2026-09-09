ALTER TABLE "customers" ADD COLUMN "locale_version" integer DEFAULT -1 NOT NULL;
--> statement-breakpoint
CREATE TABLE "customer_locale_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "locale" text NOT NULL,
  "sequence" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_locale_changes" ADD CONSTRAINT "customer_locale_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
--> statement-breakpoint
ALTER TABLE "customer_locale_changes" ADD CONSTRAINT "customer_locale_changes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_locale_changes_idempotency_idx" ON "customer_locale_changes" USING btree ("tenant_id", "idempotency_key");
