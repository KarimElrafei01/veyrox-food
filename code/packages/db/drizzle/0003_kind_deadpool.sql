CREATE TABLE "customer_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_hash" text NOT NULL,
	"scope" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid,
	"rail" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rail" text NOT NULL,
	"customer_id" uuid,
	"phone_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"template_name" text,
	"template_category" text,
	"body_hash" text NOT NULL,
	"status" text NOT NULL,
	"provider_ref" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "customer_suppressions" ADD CONSTRAINT "customer_suppressions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_events" ADD CONSTRAINT "inbound_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_suppressions_tenant_phone_idx" ON "customer_suppressions" USING btree ("tenant_id","phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_events_rail_provider_message_idx" ON "inbound_events" USING btree ("rail","provider_message_id");--> statement-breakpoint
CREATE INDEX "inbound_events_unprocessed_idx" ON "inbound_events" USING btree ("received_at") WHERE "inbound_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "outbound_messages_tenant_customer_idx" ON "outbound_messages" USING btree ("tenant_id","customer_id","created_at");