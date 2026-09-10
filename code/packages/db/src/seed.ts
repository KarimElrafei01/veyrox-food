import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import { createDatabase } from './client.js';
import {
  materialCosts,
  menuCategories,
  menuItemModifierGroups,
  menuItemPrices,
  menuItems,
  modifierGroups,
  modifierOptions,
  rawMaterials,
  recipeLines,
  recipes,
  tenants,
} from './schema/index.js';

type RecipeLine = { material: string; qty: string };

/**
 * The pilot menu, seeded for local development. It mirrors the Brew & Baladi
 * WhatsApp ordering reference, with enough variety to exercise categories,
 * unavailable items, modifiers, recipes, and loyalty perks.
 *
 * Until a café signs, every cost carries `source = 'placeholder'` and the
 * console refuses to render a margin (FR-5.14).
 *
 * Idempotent: keyed on the tenant slug. A seeded tenant is never mutated so
 * local seed data cannot rewrite an existing menu's historical records.
 */
export async function seed(connectionString?: string): Promise<{ created: boolean }> {
  const url =
    connectionString ??
    process.env.DATABASE_ADMIN_URL ??
    'postgres://postgres:postgres@localhost:5432/veyrox_food';
  const pool = new Pool({ connectionString: url });
  const db = createDatabase(pool);
  try {
    const [existing] = await db.select().from(tenants).where(eq(tenants.slug, 'brew-and-baladi'));
    if (existing && existing.qrToken !== 'seed-qr-brew-baladi') return { created: false };
    const now = new Date();
    const [tenant] = existing
      ? [existing]
      : await db
          .insert(tenants)
          .values({
            name: 'Brew & Baladi',
            slug: 'brew-and-baladi',
            qrToken: 'seed-qr-brew-baladi',
          })
          .returning();
    const t = tenant!.id;

    const materialIds = new Map<string, string>();
    const addMaterial = async (
      nameEn: string,
      nameAr: string,
      unit: 'g' | 'ml' | 'piece',
      costPerUnit: string,
      isPerishable = false,
    ) => {
      let [material] = await db
        .select()
        .from(rawMaterials)
        .where(and(eq(rawMaterials.tenantId, t), eq(rawMaterials.nameEn, nameEn)));
      if (!material) {
        [material] = await db
          .insert(rawMaterials)
          .values({ tenantId: t, nameEn, nameAr, unit, isPerishable })
          .returning();
      }
      const [cost] = await db
        .select()
        .from(materialCosts)
        .where(and(eq(materialCosts.materialId, material!.id), isNull(materialCosts.validTo)));
      if (!cost) {
        await db.insert(materialCosts).values({
          tenantId: t,
          materialId: material!.id,
          costPerUnit,
          source: 'placeholder',
          validFrom: now,
        });
      }
      materialIds.set(nameEn, material!.id);
    };

    await addMaterial('Whole milk', 'حليب كامل الدسم', 'ml', '0.012000', true);
    await addMaterial('Espresso beans', 'حبوب إسبريسو', 'g', '0.320000');
    await addMaterial('Oat milk', 'حليب الشوفان', 'ml', '0.028000', true);
    await addMaterial('Almond milk', 'حليب اللوز', 'ml', '0.032000', true);
    await addMaterial('Clover honey', 'عسل البرسيم', 'g', '0.180000');
    await addMaterial('Green cardamom', 'هيل أخضر', 'g', '0.750000');
    await addMaterial('Dried hibiscus', 'كركديه مجفف', 'g', '0.140000');
    await addMaterial('Tahini', 'طحينة', 'g', '0.110000');
    await addMaterial('Cookie dough', 'عجينة كوكيز', 'g', '0.065000');
    await addMaterial('Brioche', 'بريوش', 'g', '0.050000');
    await addMaterial('Siwa dates', 'تمر سيوة', 'g', '0.090000');
    await addMaterial('Pistachios', 'فستق', 'g', '0.400000');
    await addMaterial('Baklava pastry', 'عجينة بقلاوة', 'piece', '6.000000');
    await addMaterial('Croissant dough', 'عجينة كرواسون', 'piece', '8.000000');
    await addMaterial('Ethiopian coffee beans', 'حبوب قهوة إثيوبية', 'g', '0.380000');

    const categories = new Map<string, string>();
    const addCategory = async (nameEn: string, nameAr: string, sort: number) => {
      let [category] = await db
        .select()
        .from(menuCategories)
        .where(and(eq(menuCategories.tenantId, t), eq(menuCategories.nameEn, nameEn)));
      if (!category) {
        [category] = await db
          .insert(menuCategories)
          .values({ tenantId: t, nameEn, nameAr, sort })
          .returning();
      }
      categories.set(nameEn, category!.id);
    };
    await addCategory('Espresso', 'إسبريسو', 1);
    await addCategory('Cold Brew', 'كولد برو', 2);
    await addCategory('Pastries', 'مخبوزات', 3);
    await addCategory('Beans', 'حبوب القهوة', 4);

    const items = new Map<string, string>();
    const addItem = async (
      category: string,
      nameEn: string,
      nameAr: string,
      descriptionEn: string,
      descriptionAr: string,
      priceMinor: number,
      prepSeconds: number,
      sort: number,
      recipe: RecipeLine[],
      isAvailable = true,
    ) => {
      let [item] = await db
        .select()
        .from(menuItems)
        .where(and(eq(menuItems.tenantId, t), eq(menuItems.nameEn, nameEn)));
      if (!item) {
        [item] = await db
          .insert(menuItems)
          .values({
            tenantId: t,
            categoryId: categories.get(category)!,
            nameEn,
            nameAr,
            descriptionEn,
            descriptionAr,
            basePrepSeconds: prepSeconds,
            isAvailable,
            sort,
          })
          .returning();
      }
      const [price] = await db
        .select()
        .from(menuItemPrices)
        .where(and(eq(menuItemPrices.menuItemId, item!.id), isNull(menuItemPrices.validTo)));
      if (!price) {
        await db
          .insert(menuItemPrices)
          .values({ tenantId: t, menuItemId: item!.id, priceMinor, validFrom: now });
      }
      let [version] = await db
        .select()
        .from(recipes)
        .where(and(eq(recipes.menuItemId, item!.id), isNull(recipes.validTo)));
      if (!version) {
        [version] = await db
          .insert(recipes)
          .values({ tenantId: t, menuItemId: item!.id, version: 1, validFrom: now })
          .returning();
      }
      const lines = await db
        .select()
        .from(recipeLines)
        .where(eq(recipeLines.recipeId, version!.id));
      if (lines.length === 0) {
        await db.insert(recipeLines).values(
          recipe.map((line) => ({
            tenantId: t,
            recipeId: version!.id,
            materialId: materialIds.get(line.material)!,
            qty: line.qty,
          })),
        );
      }
      items.set(nameEn, item!.id);
    };

    await addItem(
      'Espresso',
      'Cardamom Baladi Latte',
      'لاتيه بلدي بالهيل',
      'Espresso with steamed milk, freshly crushed cardamom, and wild clover honey.',
      'إسبريسو مع حليب مبخر وهيل مطحون طازج وعسل برسيم بري.',
      7000,
      180,
      1,
      [
        { material: 'Whole milk', qty: '220.000000' },
        { material: 'Espresso beans', qty: '18.000000' },
        { material: 'Green cardamom', qty: '2.000000' },
        { material: 'Clover honey', qty: '10.000000' },
      ],
    );
    await addItem(
      'Espresso',
      'Flat White',
      'فلات وايت',
      'Double espresso folded into silky steamed milk.',
      'دبل إسبريسو مع حليب مبخر ناعم.',
      6000,
      135,
      2,
      [
        { material: 'Whole milk', qty: '180.000000' },
        { material: 'Espresso beans', qty: '20.000000' },
      ],
    );
    await addItem(
      'Espresso',
      'Americano',
      'أمريكانو',
      'A clean, long black made with our Ethiopian espresso roast.',
      'قهوة سوداء طويلة ونظيفة من تحميصنا الإثيوبي.',
      5000,
      90,
      3,
      [{ material: 'Espresso beans', qty: '18.000000' }],
    );
    await addItem(
      'Espresso',
      'Espresso',
      'إسبريسو',
      'A short, caramel-sweet Ethiopian single-origin shot.',
      'شوت إثيوبي قصير بحلاوة الكراميل.',
      4500,
      75,
      4,
      [{ material: 'Espresso beans', qty: '18.000000' }],
    );
    await addItem(
      'Cold Brew',
      'Cold Brew Hibiscus (Karkadeh)',
      'كولد برو كركديه',
      'Slow-steeped Ethiopian single origin blended with organic Egyptian karkadeh.',
      'قهوة إثيوبية منقوعة ببطء مع كركديه مصري عضوي.',
      6500,
      90,
      1,
      [
        { material: 'Ethiopian coffee beans', qty: '24.000000' },
        { material: 'Dried hibiscus', qty: '8.000000' },
      ],
    );
    await addItem(
      'Cold Brew',
      'Iced Honey Latte',
      'لاتيه عسل مثلج',
      'Espresso, cold milk, clover honey, and a gentle cardamom finish.',
      'إسبريسو وحليب بارد وعسل برسيم ولمسة هيل خفيفة.',
      7500,
      150,
      2,
      [
        { material: 'Whole milk', qty: '220.000000' },
        { material: 'Espresso beans', qty: '18.000000' },
        { material: 'Clover honey', qty: '15.000000' },
        { material: 'Green cardamom', qty: '1.000000' },
      ],
    );
    await addItem(
      'Pastries',
      'Tahina Sea Salt Cookie',
      'كوكيز طحينة وملح بحري',
      'Soft-baked sourdough cookie swirled with artisan sesame tahini and flaky sea salt.',
      'كوكيز ساوردو مخبوز طازج مع طحينة سمسم حرفية وملح بحري.',
      4000,
      45,
      1,
      [
        { material: 'Cookie dough', qty: '95.000000' },
        { material: 'Tahini', qty: '20.000000' },
      ],
    );
    await addItem(
      'Pastries',
      'Pistachio Baklava Bite',
      'لقمة بقلاوة بالفستق',
      'A crisp baklava bite layered with roasted pistachios and honey syrup.',
      'لقمة بقلاوة مقرمشة بطبقات فستق محمص وشربات عسل.',
      3500,
      30,
      2,
      [
        { material: 'Baklava pastry', qty: '1.000000' },
        { material: 'Pistachios', qty: '12.000000' },
        { material: 'Clover honey', qty: '12.000000' },
      ],
    );
    await addItem(
      'Pastries',
      'Butter Croissant',
      'كرواسون بالزبدة',
      'All-butter croissant, baked until deeply golden each morning.',
      'كرواسون زبدة مخبوز حتى يصبح ذهبيًا كل صباح.',
      4500,
      60,
      3,
      [{ material: 'Croissant dough', qty: '1.000000' }],
    );
    await addItem(
      'Pastries',
      'Baladi Date Bread Pudding',
      'بودينج خبز بالتمر البلدي',
      'Warm brioche and Siwa dates with roasted pistachios. Available after the morning bake.',
      'بريوش دافئ وتمر سيوة وفستق محمص. متاح بعد خبز الصباح.',
      5500,
      120,
      4,
      [
        { material: 'Brioche', qty: '180.000000' },
        { material: 'Siwa dates', qty: '65.000000' },
        { material: 'Pistachios', qty: '15.000000' },
      ],
      false,
    );
    await addItem(
      'Beans',
      'Ethiopian Morning Beans (250g)',
      'حبوب إثيوبية للصباح (250 جم)',
      'Whole Ethiopian single-origin beans with notes of caramel, apricot, and cocoa.',
      'حبوب إثيوبية كاملة بنكهة كراميل ومشمش وكاكاو.',
      22000,
      30,
      1,
      [{ material: 'Ethiopian coffee beans', qty: '250.000000' }],
    );

    const groups = new Map<string, string>();
    const addGroup = async (
      nameEn: string,
      nameAr: string,
      selection: 'single' | 'multi',
      minSelect: number,
      maxSelect: number | null,
      required: boolean,
    ) => {
      let [group] = await db
        .select()
        .from(modifierGroups)
        .where(and(eq(modifierGroups.tenantId, t), eq(modifierGroups.nameEn, nameEn)));
      if (!group) {
        [group] = await db
          .insert(modifierGroups)
          .values({ tenantId: t, nameEn, nameAr, selection, minSelect, maxSelect, required })
          .returning();
      }
      groups.set(nameEn, group!.id);
    };
    await addGroup('Size', 'الحجم', 'single', 1, 1, true);
    await addGroup('Milk Choice', 'اختيار الحليب', 'single', 1, 1, true);
    await addGroup('Ice / Temperature', 'الثلج / الحرارة', 'single', 1, 1, true);
    await addGroup('Barista Extras', 'إضافات الباريستا', 'multi', 0, 3, false);

    const addOption = async (
      group: string,
      nameEn: string,
      nameAr: string,
      priceDeltaMinor: number,
      freeForTier: string | null = null,
    ) => {
      const [existingOption] = await db
        .select()
        .from(modifierOptions)
        .where(
          and(eq(modifierOptions.groupId, groups.get(group)!), eq(modifierOptions.nameEn, nameEn)),
        );
      if (!existingOption) {
        await db.insert(modifierOptions).values({
          tenantId: t,
          groupId: groups.get(group)!,
          nameEn,
          nameAr,
          priceDeltaMinor,
          freeForTier,
        });
      }
    };
    await addOption('Size', 'Regular (250ml)', 'عادي (250 مل)', 0);
    await addOption('Size', 'Large (350ml)', 'كبير (350 مل)', 1500);
    await addOption('Milk Choice', 'Whole milk', 'حليب كامل الدسم', 0);
    await addOption('Milk Choice', 'Oat milk', 'حليب الشوفان', 1200, 'silver');
    await addOption('Milk Choice', 'Almond milk', 'حليب اللوز', 1200, 'silver');
    await addOption('Milk Choice', 'Skim milk', 'حليب خالي الدسم', 0);
    await addOption('Ice / Temperature', 'Hot, steamed', 'ساخن ومبخر', 0);
    await addOption('Ice / Temperature', 'Ice cubes', 'مكعبات ثلج', 0);
    await addOption('Ice / Temperature', 'Blended, crushed ice', 'مثلج مخلوط', 0);
    await addOption('Barista Extras', 'Extra espresso shot', 'شوت إسبريسو إضافي', 1500);
    await addOption('Barista Extras', 'Extra cardamom', 'هيل إضافي', 400);
    await addOption('Barista Extras', 'Clover honey', 'عسل برسيم', 500);

    const attachGroups = async (item: string, groupNames: string[]) => {
      for (const [sort, group] of groupNames.entries()) {
        const [attachment] = await db
          .select()
          .from(menuItemModifierGroups)
          .where(
            and(
              eq(menuItemModifierGroups.menuItemId, items.get(item)!),
              eq(menuItemModifierGroups.groupId, groups.get(group)!),
            ),
          );
        if (!attachment) {
          await db.insert(menuItemModifierGroups).values({
            tenantId: t,
            menuItemId: items.get(item)!,
            groupId: groups.get(group)!,
            sort: sort + 1,
          });
        }
      }
    };
    await attachGroups('Cardamom Baladi Latte', [
      'Size',
      'Milk Choice',
      'Ice / Temperature',
      'Barista Extras',
    ]);
    await attachGroups('Flat White', [
      'Size',
      'Milk Choice',
      'Ice / Temperature',
      'Barista Extras',
    ]);
    await attachGroups('Americano', ['Size', 'Ice / Temperature', 'Barista Extras']);
    await attachGroups('Iced Honey Latte', ['Size', 'Milk Choice', 'Barista Extras']);
    await attachGroups('Espresso', ['Barista Extras']);

    return { created: !existing };
  } finally {
    await pool.end();
  }
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntrypoint) {
  seed()
    .then((r) => {
      console.log(r.created ? 'Seeded pilot menu' : 'Seeded or updated pilot menu');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
