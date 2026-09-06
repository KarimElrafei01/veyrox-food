import type { Pool } from 'pg';
import { createDatabase } from '../client.js';
import {
  menuCategories,
  menuItemModifierGroups,
  menuItemPrices,
  menuItems,
  materialCosts,
  materialLedger,
  modifierGroups,
  modifierOptions,
  orderEvents,
  orderItemModifiers,
  orderItems,
  orders,
  rawMaterials,
  recipeLines,
  recipes,
  storeClosures,
  storeHours,
  tenants,
} from '../schema/index.js';

/**
 * Insert exactly one row into every table for a tenant. Used by the cross-tenant
 * leak suite: with two full graphs present, tenant A's connection must see A's
 * row and nothing of B's, in every table.
 */
export async function seedTenantGraph(pool: Pool, slug: string): Promise<string> {
  const db = createDatabase(pool);
  const now = new Date();

  const [tenant] = await db
    .insert(tenants)
    .values({ name: slug, slug, qrToken: `qr-${slug}` })
    .returning();
  const t = tenant!.id;

  await db.insert(storeHours).values({ tenantId: t, weekday: 1, opens: '08:00', closes: '22:00' });
  await db
    .insert(storeClosures)
    .values({ tenantId: t, startsAt: now, endsAt: now, reason: 'test' });

  const [material] = await db
    .insert(rawMaterials)
    .values({ tenantId: t, nameEn: 'Milk', unit: 'ml' })
    .returning();
  await db
    .insert(materialCosts)
    .values({ tenantId: t, materialId: material!.id, costPerUnit: '0.010000', validFrom: now });

  const [category] = await db
    .insert(menuCategories)
    .values({ tenantId: t, nameEn: 'Drinks' })
    .returning();
  const [item] = await db
    .insert(menuItems)
    .values({ tenantId: t, categoryId: category!.id, nameEn: 'Latte' })
    .returning();
  const [price] = await db
    .insert(menuItemPrices)
    .values({ tenantId: t, menuItemId: item!.id, priceMinor: 6500, validFrom: now })
    .returning();

  const [group] = await db
    .insert(modifierGroups)
    .values({ tenantId: t, nameEn: 'Milk', selection: 'single' })
    .returning();
  const [option] = await db
    .insert(modifierOptions)
    .values({ tenantId: t, groupId: group!.id, nameEn: 'Oat' })
    .returning();
  await db
    .insert(menuItemModifierGroups)
    .values({ tenantId: t, menuItemId: item!.id, groupId: group!.id });

  const [recipe] = await db
    .insert(recipes)
    .values({ tenantId: t, menuItemId: item!.id, version: 1, validFrom: now })
    .returning();
  await db
    .insert(recipeLines)
    .values({ tenantId: t, recipeId: recipe!.id, materialId: material!.id, qty: '220.000000' });

  const [order] = await db
    .insert(orders)
    .values({
      tenantId: t,
      orderNumber: '001',
      channel: 'cashier',
      status: 'draft',
      subtotalMinor: 6500,
      totalMinor: 6500,
      idempotencyKey: `idem-${slug}`,
    })
    .returning();
  const [orderItem] = await db
    .insert(orderItems)
    .values({
      tenantId: t,
      orderId: order!.id,
      menuItemId: item!.id,
      qty: 1,
      unitPriceMinor: 6500,
      modifierTotalMinor: 0,
      lineTotalMinor: 6500,
      costSnapshotMinor: 300,
      recipeVersionId: recipe!.id,
      menuPriceVersionId: price!.id,
      nameSnapshotEn: 'Latte',
    })
    .returning();
  await db.insert(orderItemModifiers).values({
    tenantId: t,
    orderItemId: orderItem!.id,
    modifierOptionId: option!.id,
    nameSnapshotEn: 'Oat',
    priceDeltaMinor: 1000,
  });

  await db.insert(materialLedger).values({
    tenantId: t,
    materialId: material!.id,
    qtyDelta: '-220.000000',
    reason: 'sale_deduction',
    orderId: order!.id,
    orderItemId: orderItem!.id,
    recipeVersionId: recipe!.id,
    actorType: 'system',
    createdAt: now,
  });
  await db.insert(orderEvents).values({
    tenantId: t,
    orderId: order!.id,
    toStatus: 'draft',
    actorType: 'staff',
    source: 'till',
  });

  return t;
}
