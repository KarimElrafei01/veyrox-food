import type { Pool } from 'pg';
import { createDatabase, tables } from '@veyroxai/db';

/**
 * The minimum graph `OrderPlacementRepository.place()` needs to actually place an
 * order: a tenant, a customer, one purchasable item with a live price and a
 * recipe, published into a menu version. No modifiers — this suite is about
 * concurrency, not pricing.
 */
export async function seedOrderableTenant(
  pool: Pool,
  slug: string,
): Promise<{
  tenantId: string;
  customerId: string;
  menuVersionId: string;
  itemId: string;
  recipeId: string;
  priceMinor: number;
  prepSeconds: number;
}> {
  const db = createDatabase(pool);
  const now = new Date();

  const [tenant] = await db
    .insert(tables.tenants)
    .values({ name: slug, slug, qrToken: `qr-${slug}` })
    .returning();
  const t = tenant!.id;

  const [customer] = await db
    .insert(tables.customers)
    .values({ tenantId: t, phoneHash: `hash-${slug}`, waId: `wa-${slug}`, tier: 'bronze' })
    .returning();

  const [category] = await db
    .insert(tables.menuCategories)
    .values({ tenantId: t, nameEn: 'Drinks' })
    .returning();
  const priceMinor = 6500;
  const prepSeconds = 120;
  const [item] = await db
    .insert(tables.menuItems)
    .values({
      tenantId: t,
      categoryId: category!.id,
      nameEn: 'Latte',
      basePrepSeconds: prepSeconds,
    })
    .returning();
  await db
    .insert(tables.menuItemPrices)
    .values({ tenantId: t, menuItemId: item!.id, priceMinor, validFrom: now });

  const [material] = await db
    .insert(tables.rawMaterials)
    .values({ tenantId: t, nameEn: 'Milk', unit: 'ml' })
    .returning();
  await db
    .insert(tables.materialCosts)
    .values({ tenantId: t, materialId: material!.id, costPerUnit: '0.010000', validFrom: now });
  const [recipe] = await db
    .insert(tables.recipes)
    .values({ tenantId: t, menuItemId: item!.id, version: 1, validFrom: now })
    .returning();
  await db
    .insert(tables.recipeLines)
    .values({ tenantId: t, recipeId: recipe!.id, materialId: material!.id, qty: '220.000000' });

  const [menuVersion] = await db
    .insert(tables.menuVersions)
    .values({ tenantId: t, publishedAt: now, retainedUntil: new Date(now.getTime() + 86_400_000) })
    .returning();
  const mv = menuVersion!.id;
  await db.insert(tables.menuVersionCategories).values({
    menuVersionId: mv,
    categoryId: category!.id,
    tenantId: t,
    nameEn: 'Drinks',
    sort: 0,
  });
  await db.insert(tables.menuVersionItems).values({
    menuVersionId: mv,
    menuItemId: item!.id,
    tenantId: t,
    categoryId: category!.id,
    nameEn: 'Latte',
    basePriceMinor: priceMinor,
    prepSeconds,
    sort: 0,
  });

  return {
    tenantId: t,
    customerId: customer!.id,
    menuVersionId: mv,
    itemId: item!.id,
    recipeId: recipe!.id,
    priceMinor,
    prepSeconds,
  };
}
