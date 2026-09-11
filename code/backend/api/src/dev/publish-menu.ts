import { createDatabase, createPool, eq, tables } from '@veyroxai/db';
import { CatalogueRepository } from '../contexts/catalog/infrastructure/catalogue-repository.js';

const slug = process.env.TENANT_SLUG ?? 'brew-and-baladi';
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is not set.');

const pool = createPool(adminUrl);
const db = createDatabase(pool);
try {
  const [tenant] = await db.select().from(tables.tenants).where(eq(tables.tenants.slug, slug));
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);
  const menuVersionId = await new CatalogueRepository(db).publish(tenant.id, new Date());
  console.log(`Published menu version: ${menuVersionId}`);
} finally {
  await pool.end();
}
