import {
  bigint,
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tenantCol, ts, updatedAt } from './_shared.js';
import { tenants } from './tenants.js';

// docs/04-data-model.md §5. Menu, recipes, and materials — the versioned core.

export const rawMaterials = pgTable('raw_materials', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  unit: text('unit').notNull(), // g | ml | piece
  isPerishable: boolean('is_perishable').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// VERSIONED. `source = 'placeholder'` is a first-class, queryable state that blocks
// the M3 gate (docs/04 §5, PRD R5).
export const materialCosts = pgTable('material_costs', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  materialId: uuid('material_id')
    .notNull()
    .references(() => rawMaterials.id),
  costPerUnit: numeric('cost_per_unit', { precision: 14, scale: 6 }).notNull(),
  source: text('source').notNull().default('placeholder'), // supplier_invoice | owner_estimate | placeholder
  validFrom: ts('valid_from').notNull(),
  validTo: ts('valid_to'),
  enteredBy: uuid('entered_by'),
  createdAt: createdAt(),
});

export const menuCategories = pgTable('menu_categories', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const menuItems = pgTable('menu_items', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  categoryId: uuid('category_id').references(() => menuCategories.id),
  nameEn: text('name_en').notNull(), // Q5: en required, ar optional
  nameAr: text('name_ar'),
  descriptionEn: text('description_en'),
  descriptionAr: text('description_ar'),
  imageObjectKey: text('image_object_key'),
  basePrepSeconds: integer('base_prep_seconds').notNull().default(120), // ETA input
  isAvailable: boolean('is_available').notNull().default(true), // "86-ing" (GAP-02, P0)
  unavailableUntil: ts('unavailable_until'),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// VERSIONED. Editing a price closes one row and opens another.
export const menuItemPrices = pgTable('menu_item_prices', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  menuItemId: uuid('menu_item_id')
    .notNull()
    .references(() => menuItems.id),
  priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
  validFrom: ts('valid_from').notNull(),
  validTo: ts('valid_to'),
  enteredBy: uuid('entered_by'),
  createdAt: createdAt(),
});

export const modifierGroups = pgTable('modifier_groups', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  selection: text('selection').notNull(), // single | multi
  minSelect: integer('min_select').notNull().default(0),
  maxSelect: integer('max_select'),
  required: boolean('required').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const modifierOptions = pgTable('modifier_options', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  groupId: uuid('group_id')
    .notNull()
    .references(() => modifierGroups.id),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar'),
  priceDeltaMinor: bigint('price_delta_minor', { mode: 'number' }).notNull().default(0),
  isAvailable: boolean('is_available').notNull().default(true),
  freeForTier: text('free_for_tier'), // e.g. 'silver' → free alt-milk perk
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const menuItemModifierGroups = pgTable(
  'menu_item_modifier_groups',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    groupId: uuid('group_id')
      .notNull()
      .references(() => modifierGroups.id),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [uniqueIndex('menu_item_modifier_group_idx').on(t.menuItemId, t.groupId)],
);

// A published menu is immutable so a session-pinned cart cannot change beneath a
// customer when the live catalogue is edited (ADR-0017).
export const menuVersions = pgTable('menu_versions', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  publishedAt: ts('published_at').notNull(),
  retainedUntil: ts('retained_until').notNull(),
  createdAt: createdAt(),
});

export const menuVersionCategories = pgTable(
  'menu_version_categories',
  {
    menuVersionId: uuid('menu_version_id')
      .notNull()
      .references(() => menuVersions.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id),
    tenantId: tenantCol().references(() => tenants.id),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar'),
    sort: integer('sort').notNull(),
  },
  (t) => [primaryKey({ columns: [t.menuVersionId, t.categoryId] })],
);

export const menuVersionItems = pgTable(
  'menu_version_items',
  {
    menuVersionId: uuid('menu_version_id')
      .notNull()
      .references(() => menuVersions.id),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    tenantId: tenantCol().references(() => tenants.id),
    categoryId: uuid('category_id').references(() => menuCategories.id),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar'),
    descriptionEn: text('description_en'),
    descriptionAr: text('description_ar'),
    imageObjectKey: text('image_object_key'),
    basePriceMinor: bigint('base_price_minor', { mode: 'number' }).notNull(),
    prepSeconds: integer('prep_seconds').notNull(),
    sort: integer('sort').notNull(),
  },
  (t) => [primaryKey({ columns: [t.menuVersionId, t.menuItemId] })],
);

export const menuVersionModifierGroups = pgTable(
  'menu_version_modifier_groups',
  {
    menuVersionId: uuid('menu_version_id')
      .notNull()
      .references(() => menuVersions.id),
    modifierGroupId: uuid('modifier_group_id')
      .notNull()
      .references(() => modifierGroups.id),
    tenantId: tenantCol().references(() => tenants.id),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar'),
    selection: text('selection').notNull(),
    minSelect: integer('min_select').notNull(),
    maxSelect: integer('max_select'),
    required: boolean('required').notNull(),
  },
  (t) => [primaryKey({ columns: [t.menuVersionId, t.modifierGroupId] })],
);

export const menuVersionModifierOptions = pgTable(
  'menu_version_modifier_options',
  {
    menuVersionId: uuid('menu_version_id')
      .notNull()
      .references(() => menuVersions.id),
    modifierOptionId: uuid('modifier_option_id')
      .notNull()
      .references(() => modifierOptions.id),
    tenantId: tenantCol().references(() => tenants.id),
    modifierGroupId: uuid('modifier_group_id')
      .notNull()
      .references(() => modifierGroups.id),
    nameEn: text('name_en').notNull(),
    nameAr: text('name_ar'),
    priceDeltaMinor: bigint('price_delta_minor', { mode: 'number' }).notNull(),
    freeForTier: text('free_for_tier'),
    sort: integer('sort').notNull(),
  },
  (t) => [primaryKey({ columns: [t.menuVersionId, t.modifierOptionId] })],
);

export const menuVersionItemModifierGroups = pgTable(
  'menu_version_item_modifier_groups',
  {
    menuVersionId: uuid('menu_version_id')
      .notNull()
      .references(() => menuVersions.id),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    modifierGroupId: uuid('modifier_group_id')
      .notNull()
      .references(() => modifierGroups.id),
    tenantId: tenantCol().references(() => tenants.id),
    sort: integer('sort').notNull(),
  },
  (t) => [primaryKey({ columns: [t.menuVersionId, t.menuItemId, t.modifierGroupId] })],
);

// VERSIONED HEADER. Recipes are never edited in place (docs/04 §5).
export const recipes = pgTable(
  'recipes',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    version: integer('version').notNull(),
    validFrom: ts('valid_from').notNull(),
    validTo: ts('valid_to'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('recipe_item_version_idx').on(t.tenantId, t.menuItemId, t.version)],
);

export const recipeLines = pgTable('recipe_lines', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  recipeId: uuid('recipe_id')
    .notNull()
    .references(() => recipes.id),
  materialId: uuid('material_id')
    .notNull()
    .references(() => rawMaterials.id),
  qty: numeric('qty', { precision: 14, scale: 6 }).notNull(), // in material.unit
  modifierOptionId: uuid('modifier_option_id').references(() => modifierOptions.id), // line applies only with this modifier
});
