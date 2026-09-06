import type { Pool } from 'pg';
import { createDatabase } from '../client.js';
import {
  customers,
  customerSuppressions,
  inboundEvents,
  loyaltyLedger,
  menuCategories,
  menuItemModifierGroups,
  menuItemPrices,
  menuItems,
  menuVersionCategories,
  menuVersionItemModifierGroups,
  menuVersionItems,
  menuVersionModifierGroups,
  menuVersionModifierOptions,
  menuVersions,
  materialCosts,
  materialLedger,
  modifierGroups,
  modifierOptions,
  orderEvents,
  orderItemModifiers,
  orderItems,
  orderNumberCounters,
  orders,
  outboundMessages,
  rawMaterials,
  recipeLines,
  recipes,
  storeClosures,
  storeHours,
  tenants,
  tierCelebrations,
} from '../schema/index.js';

/**
 * Insert exactly one row into every table for a tenant. Used by the cross-tenant
 * leak suite: with two full graphs present, tenant A's connection must see A's
 * row and nothing of B's, in every table. When a table is added to the schema it
 * must be added here in the same change, or the suite fails for it.
 */
export async function seedTenantGraph(pool: Pool, slug: string): Promise<string> {
  const db = createDatabase(pool);
  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  const [tenant] = await db
    .insert(tenants)
    .values({ name: slug, slug, qrToken: `qr-${slug}` })
    .returning();
  const t = tenant!.id;

  const [customer] = await db
    .insert(customers)
    .values({ tenantId: t, phoneHash: `hash-${slug}`, waId: `wa-${slug}`, tier: 'silver' })
    .returning();

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

  const [menuVersion] = await db
    .insert(menuVersions)
    .values({ tenantId: t, publishedAt: now, retainedUntil: now })
    .returning();
  const mv = menuVersion!.id;
  await db.insert(menuVersionCategories).values({
    menuVersionId: mv,
    categoryId: category!.id,
    tenantId: t,
    nameEn: 'Drinks',
    sort: 0,
  });
  await db.insert(menuVersionItems).values({
    menuVersionId: mv,
    menuItemId: item!.id,
    tenantId: t,
    categoryId: category!.id,
    nameEn: 'Latte',
    basePriceMinor: 6500,
    prepSeconds: 120,
    sort: 0,
  });
  await db.insert(menuVersionModifierGroups).values({
    menuVersionId: mv,
    modifierGroupId: group!.id,
    tenantId: t,
    nameEn: 'Milk',
    selection: 'single',
    minSelect: 0,
    required: false,
  });
  await db.insert(menuVersionModifierOptions).values({
    menuVersionId: mv,
    modifierOptionId: option!.id,
    tenantId: t,
    modifierGroupId: group!.id,
    nameEn: 'Oat',
    priceDeltaMinor: 1000,
    sort: 0,
  });
  await db.insert(menuVersionItemModifierGroups).values({
    menuVersionId: mv,
    menuItemId: item!.id,
    modifierGroupId: group!.id,
    tenantId: t,
    sort: 0,
  });

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
      businessDate: day,
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
  await db.insert(orderNumberCounters).values({ tenantId: t, businessDate: day, nextSeq: 2 });

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
  await db.insert(loyaltyLedger).values({
    tenantId: t,
    customerId: customer!.id,
    delta: 6,
    reason: 'collection',
    orderId: order!.id,
  });
  await db.insert(orderEvents).values({
    tenantId: t,
    orderId: order!.id,
    toStatus: 'draft',
    actorType: 'staff',
    source: 'till',
  });
  await db.insert(tierCelebrations).values({
    tenantId: t,
    customerId: customer!.id,
    tier: 'silver',
    cairoDate: day,
  });

  // `inbound_events.tenant_id` is nullable and its unique key is (rail,
  // provider_message_id) — not tenant-scoped — so the id must be unique per graph.
  await db.insert(inboundEvents).values({
    tenantId: t,
    rail: 'official',
    providerMessageId: `provider-${slug}`,
    payload: { probe: slug },
  });
  await db
    .insert(customerSuppressions)
    .values({ tenantId: t, phoneHash: `hash-${slug}`, scope: 'habit', reason: 'test' });
  await db.insert(outboundMessages).values({
    tenantId: t,
    rail: 'official',
    customerId: customer!.id,
    phoneHash: `hash-${slug}`,
    purpose: 'order_confirmation',
    bodyHash: `body-${slug}`,
    status: 'sent',
  });

  return t;
}
