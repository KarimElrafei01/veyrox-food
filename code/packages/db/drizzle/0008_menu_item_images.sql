-- Menu images are immutable once a menu is published. R2 holds bytes; Postgres
-- retains only the tenant-scoped object key that the API resolves at read time.
ALTER TABLE "menu_items" ADD COLUMN "image_object_key" text;
--> statement-breakpoint
ALTER TABLE "menu_version_items" ADD COLUMN "image_object_key" text;
