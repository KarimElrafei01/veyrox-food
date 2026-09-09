CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_e164" text,
	"phone_hash" text NOT NULL,
	"wa_id" text,
	"display_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"points_cache" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"first_order_at" timestamp with time zone,
	"last_order_at" timestamp with time zone,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_phone_hash_idx" ON "customers" USING btree ("tenant_id","phone_hash");
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customers"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
