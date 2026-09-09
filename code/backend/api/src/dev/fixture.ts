/**
 * Dev-only fixture for exercising every F1 endpoint by hand.
 *
 *   pnpm db:seed                        # the Brew & Baladi catalogue (idempotent)
 *   SESSION_KEY=dev pnpm --filter @veyroxai/api fixture
 *
 * Extends the seed with store hours, modifiers, an 86'd item, a published menu
 * version, four customers in different states, and a few pre-made orders — then
 * prints a ready-to-paste curl kit. Idempotent: safe to re-run (tokens rotate).
 *
 * Never run against a real tenant's database.
 */
import { and, createDatabase, createPool, eq, isNull, tables, type Database } from '@veyroxai/db';
import { CatalogueRepository } from '../contexts/catalog/infrastructure/catalogue-repository.js';
import { mintCustomerSession } from '../contexts/ordering/interface/session-token.js';

const SLUG = 'brew-and-baladi';
const now = new Date();
const day = now.toISOString().slice(0, 10);

async function selectOne<T>(rows: Promise<T[]>): Promise<T | undefined> {
  return (await rows)[0];
}

async function ensureMaterial(db: Database, t: string, nameEn: string, unit: string) {
  const found = await selectOne(
    db
      .select()
      .from(tables.rawMaterials)
      .where(and(eq(tables.rawMaterials.tenantId, t), eq(tables.rawMaterials.nameEn, nameEn))),
  );
  if (found) return found;
  const [row] = await db
    .insert(tables.rawMaterials)
    .values({ tenantId: t, nameEn, unit })
    .returning();
  await db
    .insert(tables.materialCosts)
    .values({ tenantId: t, materialId: row!.id, costPerUnit: '0.015000', validFrom: now });
  return row!;
}

async function ensureItem(
  db: Database,
  t: string,
  categoryId: string,
  nameEn: string,
  priceMinor: number,
  opts: { isAvailable?: boolean; prepSeconds?: number } = {},
) {
  let item = await selectOne(
    db
      .select()
      .from(tables.menuItems)
      .where(and(eq(tables.menuItems.tenantId, t), eq(tables.menuItems.nameEn, nameEn))),
  );
  if (!item) {
    [item] = await db
      .insert(tables.menuItems)
      .values({
        tenantId: t,
        categoryId,
        nameEn,
        basePrepSeconds: opts.prepSeconds ?? 150,
        isAvailable: opts.isAvailable ?? true,
      })
      .returning();
  } else {
    await db
      .update(tables.menuItems)
      .set({ isAvailable: opts.isAvailable ?? true })
      .where(eq(tables.menuItems.id, item.id));
  }
  const price = await selectOne(
    db
      .select()
      .from(tables.menuItemPrices)
      .where(
        and(eq(tables.menuItemPrices.menuItemId, item!.id), isNull(tables.menuItemPrices.validTo)),
      ),
  );
  if (!price) {
    await db
      .insert(tables.menuItemPrices)
      .values({ tenantId: t, menuItemId: item!.id, priceMinor, validFrom: now });
  }
  const recipe = await selectOne(
    db
      .select()
      .from(tables.recipes)
      .where(and(eq(tables.recipes.menuItemId, item!.id), isNull(tables.recipes.validTo))),
  );
  if (!recipe) {
    await db
      .insert(tables.recipes)
      .values({ tenantId: t, menuItemId: item!.id, version: 1, validFrom: now });
  }
  return item!;
}

async function ensureGroup(
  db: Database,
  t: string,
  nameEn: string,
  selection: 'single' | 'multi',
  required: boolean,
  minSelect: number,
  maxSelect: number | null,
) {
  const found = await selectOne(
    db
      .select()
      .from(tables.modifierGroups)
      .where(and(eq(tables.modifierGroups.tenantId, t), eq(tables.modifierGroups.nameEn, nameEn))),
  );
  if (found) return found;
  const [row] = await db
    .insert(tables.modifierGroups)
    .values({ tenantId: t, nameEn, selection, required, minSelect, maxSelect })
    .returning();
  return row!;
}

async function ensureOption(
  db: Database,
  t: string,
  groupId: string,
  nameEn: string,
  priceDeltaMinor: number,
  opts: { isAvailable?: boolean; freeForTier?: string } = {},
) {
  const found = await selectOne(
    db
      .select()
      .from(tables.modifierOptions)
      .where(
        and(eq(tables.modifierOptions.groupId, groupId), eq(tables.modifierOptions.nameEn, nameEn)),
      ),
  );
  if (found) {
    await db
      .update(tables.modifierOptions)
      .set({ isAvailable: opts.isAvailable ?? true })
      .where(eq(tables.modifierOptions.id, found.id));
    return found;
  }
  const [row] = await db
    .insert(tables.modifierOptions)
    .values({
      tenantId: t,
      groupId,
      nameEn,
      priceDeltaMinor,
      isAvailable: opts.isAvailable ?? true,
      freeForTier: opts.freeForTier ?? null,
    })
    .returning();
  return row!;
}

async function attach(db: Database, t: string, menuItemId: string, groupId: string) {
  const found = await selectOne(
    db
      .select()
      .from(tables.menuItemModifierGroups)
      .where(
        and(
          eq(tables.menuItemModifierGroups.menuItemId, menuItemId),
          eq(tables.menuItemModifierGroups.groupId, groupId),
        ),
      ),
  );
  if (!found) {
    await db.insert(tables.menuItemModifierGroups).values({ tenantId: t, menuItemId, groupId });
  }
}

async function ensureCustomer(
  db: Database,
  t: string,
  handle: string,
  tier: string,
  points: number,
) {
  const phoneHash = `hash-${handle}`;
  const found = await selectOne(
    db
      .select()
      .from(tables.customers)
      .where(and(eq(tables.customers.tenantId, t), eq(tables.customers.phoneHash, phoneHash))),
  );
  if (found) {
    await db
      .update(tables.customers)
      .set({ tier, pointsCache: points })
      .where(eq(tables.customers.id, found.id));
    return found;
  }
  const [row] = await db
    .insert(tables.customers)
    .values({
      tenantId: t,
      phoneHash,
      waId: `2010000${handle.length}${points}`,
      displayName: handle,
      tier,
      pointsCache: points,
      locale: 'en',
    })
    .returning();
  return row!;
}

async function ensureOrder(
  db: Database,
  t: string,
  customerId: string,
  orderNumber: string,
  status: string,
  extra: Partial<typeof tables.orders.$inferInsert> = {},
) {
  const found = await selectOne(
    db
      .select()
      .from(tables.orders)
      .where(and(eq(tables.orders.tenantId, t), eq(tables.orders.orderNumber, orderNumber))),
  );
  if (found) return found;
  const [row] = await db
    .insert(tables.orders)
    .values({
      tenantId: t,
      customerId,
      orderNumber,
      businessDate: day,
      channel: 'whatsapp',
      status,
      subtotalMinor: 6500,
      discountMinor: 0,
      totalMinor: 6500,
      idempotencyKey: `fixture-${orderNumber}`,
      ...extra,
    })
    .returning();
  await db.insert(tables.orderEvents).values({
    tenantId: t,
    orderId: row!.id,
    fromStatus: null,
    toStatus: status,
    actorType: 'customer',
    actorId: customerId,
    source: 'webview',
  });
  return row!;
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is not set');
  const sessionKey = process.env.SESSION_KEY ?? 'dev-session-key';
  const pool = createPool(adminUrl);
  const db = createDatabase(pool);

  try {
    const tenant = await selectOne(
      db.select().from(tables.tenants).where(eq(tables.tenants.slug, SLUG)),
    );
    if (!tenant) throw new Error(`No "${SLUG}" tenant — run \`pnpm db:seed\` first.`);
    const t = tenant.id;

    // Always open, every day, for hand testing.
    await db.delete(tables.storeHours).where(eq(tables.storeHours.tenantId, t));
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await db
        .insert(tables.storeHours)
        .values({ tenantId: t, weekday, opens: '00:00', closes: '23:59' });
    }

    const milk = await ensureMaterial(db, t, 'Whole milk', 'ml');
    await ensureMaterial(db, t, 'Oat milk', 'ml');

    const category = await selectOne(
      db
        .select()
        .from(tables.menuCategories)
        .where(
          and(
            eq(tables.menuCategories.tenantId, t),
            eq(tables.menuCategories.nameEn, 'Hot drinks'),
          ),
        ),
    );
    const catId = category!.id;

    const latte = await ensureItem(db, t, catId, 'Latte', 6500, { prepSeconds: 150 });
    const cappuccino = await ensureItem(db, t, catId, 'Cappuccino', 6000, { prepSeconds: 120 });
    const icedLatte = await ensureItem(db, t, catId, 'Iced Latte', 7000, { isAvailable: false });

    // recipe lines (idempotent-ish: only add when the recipe has none)
    for (const item of [latte, cappuccino, icedLatte]) {
      const recipe = await selectOne(
        db
          .select()
          .from(tables.recipes)
          .where(and(eq(tables.recipes.menuItemId, item.id), isNull(tables.recipes.validTo))),
      );
      const lines = await db
        .select()
        .from(tables.recipeLines)
        .where(eq(tables.recipeLines.recipeId, recipe!.id));
      if (lines.length === 0) {
        await db
          .insert(tables.recipeLines)
          .values({ tenantId: t, recipeId: recipe!.id, materialId: milk.id, qty: '220.000000' });
      }
    }

    const milkGroup = await ensureGroup(db, t, 'Milk', 'single', true, 1, 1);
    await ensureOption(db, t, milkGroup.id, 'Regular', 0);
    const oat = await ensureOption(db, t, milkGroup.id, 'Oat', 1000, { freeForTier: 'silver' });
    await ensureOption(db, t, milkGroup.id, 'Almond', 1000, { isAvailable: false });

    const shotsGroup = await ensureGroup(db, t, 'Extra shots', 'multi', false, 0, 2);
    const extraShot = await ensureOption(db, t, shotsGroup.id, 'Extra shot', 1500);

    await attach(db, t, latte.id, milkGroup.id);
    await attach(db, t, latte.id, shotsGroup.id);
    await attach(db, t, cappuccino.id, milkGroup.id);

    const menuVersionId = await new CatalogueRepository(db).publish(t, now);

    const fresh = await ensureCustomer(db, t, 'fresh', 'bronze', 40);
    const gold = await ensureCustomer(db, t, 'gold', 'gold', 600);
    const bronze = await ensureCustomer(db, t, 'bronze', 'bronze', 120);
    const suspended = await ensureCustomer(db, t, 'suspended', 'bronze', 0);

    // bronze has one open order -> GET status "placed" AND OPEN_ORDER_LIMIT on a new POST
    await ensureOrder(db, t, bronze.id, 'A-101', 'placed', {
      placementResponse: {
        orderId: '(set on read)',
        orderNumber: 'A-101',
        status: 'placed',
        totalMinor: 6500,
        payAt: 'counter',
        eta: {
          lowerMinutes: null,
          upperMinutes: null,
          startsOnAccept: true,
          promisedLowerAt: null,
          promisedUpperAt: null,
        },
        loyalty: { pointsToEarn: 6 },
        placedAt: now.toISOString(),
        traceId: 'fixture',
      },
    });
    // gold has an accepted order -> GET status with a running countdown
    await ensureOrder(db, t, gold.id, 'A-102', 'received', {
      acceptedAt: now,
      promisedEtaLowerAt: new Date(now.getTime() + 8 * 60_000),
      promisedEtaUpperAt: new Date(now.getTime() + 12 * 60_000),
    });
    // a terminal rejected order
    await ensureOrder(db, t, gold.id, 'A-103', 'rejected', {
      rejectionReason: 'item_unavailable',
      rejectedAt: now,
    });
    // suspended: three abandonments in the last 90 days
    for (const n of [1, 2, 3]) {
      await ensureOrder(db, t, suspended.id, `A-09${n}`, 'abandoned');
    }

    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + 24 * 3600;
    const token = (customerId: string, waId: string, tier: 'bronze' | 'silver' | 'gold') =>
      mintCustomerSession(
        {
          tenantId: t,
          customerId,
          waId,
          menuVersionId,
          tier,
          locale: 'en',
          issuedAt: iat,
          expiresAt: exp,
        },
        sessionKey,
      );

    const bronzeOpen = await selectOne(
      db.select().from(tables.orders).where(eq(tables.orders.orderNumber, 'A-101')),
    );
    const goldAccepted = await selectOne(
      db.select().from(tables.orders).where(eq(tables.orders.orderNumber, 'A-102')),
    );

    const out = {
      SESSION_KEY: sessionKey,
      tenantId: t,
      menuVersionId,
      items: { latte: latte.id, cappuccino: cappuccino.id, icedLatte86: icedLatte.id },
      modifierOptions: {
        oatMilk: oat.id,
        extraShot: extraShot.id,
        milkGroupRequired: milkGroup.id,
      },
      customers: {
        fresh: { id: fresh.id, tier: 'bronze', token: token(fresh.id, '201000001', 'bronze') },
        gold: { id: gold.id, tier: 'gold', token: token(gold.id, '201000002', 'gold') },
        bronze: { id: bronze.id, tier: 'bronze', token: token(bronze.id, '201000003', 'bronze') },
        suspended: {
          id: suspended.id,
          tier: 'bronze',
          token: token(suspended.id, '201000004', 'bronze'),
        },
      },
      orders: { placed: bronzeOpen!.id, accepted: goldAccepted!.id },
    };
    console.log(JSON.stringify(out, null, 2));
    console.log(`\n--- curl kit (API on http://localhost:3001) ---`);
    const b = `http://localhost:3001`;
    const fT = out.customers.fresh.token;
    console.log(`
# health
curl -s ${b}/health | jq

# F1.1 session (fresh customer)
curl -s ${b}/public/session/${fT} | jq
# suspended customer -> 403 ORDERING_SUSPENDED
curl -s ${b}/public/session/${out.customers.suspended.token} | jq

# F1.2 published menu (+ ETag)
curl -s ${b}/public/menu/${menuVersionId} | jq
# live availability
curl -s ${b}/public/availability -H "authorization: Bearer ${fT}" | jq

# F1.3 quote — Latte + Oat milk (required group satisfied) + 1 extra shot
curl -s ${b}/public/orders/quote -H "authorization: Bearer ${fT}" -H 'content-type: application/json' \\
  -d '{"items":[{"menuItemId":"${latte.id}","qty":1,"modifierOptionIds":["${oat.id}","${extraShot.id}"]}]}' | jq
# quote for gold — Oat milk is waived by tier
curl -s ${b}/public/orders/quote -H "authorization: Bearer ${out.customers.gold.token}" -H 'content-type: application/json' \\
  -d '{"items":[{"menuItemId":"${latte.id}","qty":1,"modifierOptionIds":["${oat.id}"]}]}' | jq

# F1.6 place order (fresh customer, needs Idempotency-Key)
curl -s ${b}/public/orders -H "authorization: Bearer ${fT}" -H 'content-type: application/json' \\
  -H "idempotency-key: $(uuidgen | tr A-F a-f)" \\
  -d '{"items":[{"menuItemId":"${latte.id}","qty":1,"modifierOptionIds":["${oat.id}"]}]}' | jq
# 86'd item -> 409 ITEM_UNAVAILABLE
curl -s ${b}/public/orders -H "authorization: Bearer ${fT}" -H 'content-type: application/json' \\
  -H "idempotency-key: $(uuidgen | tr A-F a-f)" \\
  -d '{"items":[{"menuItemId":"${icedLatte.id}","qty":1,"modifierOptionIds":[]}]}' | jq
# bronze customer already has an open order -> 409 OPEN_ORDER_LIMIT
curl -s ${b}/public/orders -H "authorization: Bearer ${out.customers.bronze.token}" -H 'content-type: application/json' \\
  -H "idempotency-key: $(uuidgen | tr A-F a-f)" \\
  -d '{"items":[{"menuItemId":"${cappuccino.id}","qty":1,"modifierOptionIds":[]}]}' | jq

# F1.7 order status
curl -s ${b}/public/orders/${bronzeOpen!.id}/status -H "authorization: Bearer ${out.customers.bronze.token}" | jq
curl -s ${b}/public/orders/${goldAccepted!.id}/status -H "authorization: Bearer ${out.customers.gold.token}" | jq
# wrong owner -> 404
curl -s ${b}/public/orders/${goldAccepted!.id}/status -H "authorization: Bearer ${fT}" | jq
`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
