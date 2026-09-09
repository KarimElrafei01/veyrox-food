import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { createDatabase } from './client.js';
import {
  menuCategories,
  menuItemPrices,
  menuItems,
  rawMaterials,
  materialCosts,
  recipeLines,
  recipes,
  tenants,
} from './schema/index.js';

/**
 * The pilot menu, seeded for local development. Until a café signs, every cost
 * carries `source = 'placeholder'` and the console refuses to render a margin
 * (FR-5.14) — that stays true here (docs/CLAUDE.md — State of play).
 *
 * Idempotent: keyed on the tenant slug.
 */
export async function seed(connectionString?: string): Promise<{ created: boolean }> {
  const url =
    connectionString ??
    process.env.DATABASE_ADMIN_URL ??
    'postgres://postgres:postgres@localhost:5432/veyrox_food';
  const pool = new Pool({ connectionString: url });
  const db = createDatabase(pool);
  try {
    const existing = await db.select().from(tenants).where(eq(tenants.slug, 'brew-and-baladi'));
    if (existing.length > 0) {
      return { created: false };
    }

    const now = new Date();
    const [tenant] = await db
      .insert(tenants)
      .values({ name: 'Brew & Baladi', slug: 'brew-and-baladi', qrToken: 'seed-qr-brew-baladi' })
      .returning();

    const t = tenant!.id;

    const [milk] = await db
      .insert(rawMaterials)
      .values({
        tenantId: t,
        nameEn: 'Whole milk',
        nameAr: 'حليب كامل الدسم',
        unit: 'ml',
        isPerishable: true,
      })
      .returning();
    const [beans] = await db
      .insert(rawMaterials)
      .values({ tenantId: t, nameEn: 'Espresso beans', nameAr: 'حبوب إسبريسو', unit: 'g' })
      .returning();

    await db.insert(materialCosts).values([
      {
        tenantId: t,
        materialId: milk!.id,
        costPerUnit: '0.012000',
        source: 'placeholder',
        validFrom: now,
      },
      {
        tenantId: t,
        materialId: beans!.id,
        costPerUnit: '0.320000',
        source: 'placeholder',
        validFrom: now,
      },
    ]);

    const [hot] = await db
      .insert(menuCategories)
      .values({ tenantId: t, nameEn: 'Hot drinks', nameAr: 'مشروبات ساخنة', sort: 1 })
      .returning();

    const [latte] = await db
      .insert(menuItems)
      .values({
        tenantId: t,
        categoryId: hot!.id,
        nameEn: 'Latte',
        nameAr: 'لاتيه',
        basePrepSeconds: 150,
      })
      .returning();

    await db
      .insert(menuItemPrices)
      .values({ tenantId: t, menuItemId: latte!.id, priceMinor: 6500, validFrom: now });

    const [recipe] = await db
      .insert(recipes)
      .values({ tenantId: t, menuItemId: latte!.id, version: 1, validFrom: now })
      .returning();

    await db.insert(recipeLines).values([
      { tenantId: t, recipeId: recipe!.id, materialId: milk!.id, qty: '220.000000' },
      { tenantId: t, recipeId: recipe!.id, materialId: beans!.id, qty: '18.000000' },
    ]);

    return { created: true };
  } finally {
    await pool.end();
  }
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  seed()
    .then((r) => {
      console.log(r.created ? 'Seeded pilot menu' : 'Seed already present — no-op');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
