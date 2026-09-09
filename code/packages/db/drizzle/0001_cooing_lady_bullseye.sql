CREATE TABLE "menu_version_categories" (
	"menu_version_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"sort" integer NOT NULL,
	CONSTRAINT "menu_version_categories_menu_version_id_category_id_pk" PRIMARY KEY("menu_version_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "menu_version_item_modifier_groups" (
	"menu_version_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"modifier_group_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "menu_version_item_modifier_groups_menu_version_id_menu_item_id_modifier_group_id_pk" PRIMARY KEY("menu_version_id","menu_item_id","modifier_group_id")
);
--> statement-breakpoint
CREATE TABLE "menu_version_items" (
	"menu_version_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"name_en" text NOT NULL,
	"name_ar" text,
	"description_en" text,
	"description_ar" text,
	"base_price_minor" bigint NOT NULL,
	"prep_seconds" integer NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "menu_version_items_menu_version_id_menu_item_id_pk" PRIMARY KEY("menu_version_id","menu_item_id")
);
--> statement-breakpoint
CREATE TABLE "menu_version_modifier_groups" (
	"menu_version_id" uuid NOT NULL,
	"modifier_group_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"selection" text NOT NULL,
	"min_select" integer NOT NULL,
	"max_select" integer,
	"required" boolean NOT NULL,
	CONSTRAINT "menu_version_modifier_groups_menu_version_id_modifier_group_id_pk" PRIMARY KEY("menu_version_id","modifier_group_id")
);
--> statement-breakpoint
CREATE TABLE "menu_version_modifier_options" (
	"menu_version_id" uuid NOT NULL,
	"modifier_option_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"modifier_group_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text,
	"price_delta_minor" bigint NOT NULL,
	"free_for_tier" text,
	"sort" integer NOT NULL,
	CONSTRAINT "menu_version_modifier_options_menu_version_id_modifier_option_id_pk" PRIMARY KEY("menu_version_id","modifier_option_id")
);
--> statement-breakpoint
CREATE TABLE "menu_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"retained_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_version_categories" ADD CONSTRAINT "menu_version_categories_menu_version_id_menu_versions_id_fk" FOREIGN KEY ("menu_version_id") REFERENCES "public"."menu_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_categories" ADD CONSTRAINT "menu_version_categories_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_categories" ADD CONSTRAINT "menu_version_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_item_modifier_groups" ADD CONSTRAINT "menu_version_item_modifier_groups_menu_version_id_menu_versions_id_fk" FOREIGN KEY ("menu_version_id") REFERENCES "public"."menu_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_item_modifier_groups" ADD CONSTRAINT "menu_version_item_modifier_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_item_modifier_groups" ADD CONSTRAINT "menu_version_item_modifier_groups_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_item_modifier_groups" ADD CONSTRAINT "menu_version_item_modifier_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_items" ADD CONSTRAINT "menu_version_items_menu_version_id_menu_versions_id_fk" FOREIGN KEY ("menu_version_id") REFERENCES "public"."menu_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_items" ADD CONSTRAINT "menu_version_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_items" ADD CONSTRAINT "menu_version_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_items" ADD CONSTRAINT "menu_version_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_modifier_groups" ADD CONSTRAINT "menu_version_modifier_groups_menu_version_id_menu_versions_id_fk" FOREIGN KEY ("menu_version_id") REFERENCES "public"."menu_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_modifier_groups" ADD CONSTRAINT "menu_version_modifier_groups_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_modifier_groups" ADD CONSTRAINT "menu_version_modifier_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_modifier_options" ADD CONSTRAINT "menu_version_modifier_options_menu_version_id_menu_versions_id_fk" FOREIGN KEY ("menu_version_id") REFERENCES "public"."menu_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_modifier_options" ADD CONSTRAINT "menu_version_modifier_options_modifier_option_id_modifier_options_id_fk" FOREIGN KEY ("modifier_option_id") REFERENCES "public"."modifier_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_modifier_options" ADD CONSTRAINT "menu_version_modifier_options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_version_modifier_options" ADD CONSTRAINT "menu_version_modifier_options_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_versions" ADD CONSTRAINT "menu_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "menu_versions_tenant_published_idx" ON "menu_versions" USING btree ("tenant_id", "published_at");
--> statement-breakpoint
ALTER TABLE "menu_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_versions"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "menu_version_categories" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_version_categories"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "menu_version_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_version_items"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "menu_version_modifier_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_version_modifier_groups"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "menu_version_modifier_options" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_version_modifier_options"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "menu_version_item_modifier_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "menu_version_item_modifier_groups"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
