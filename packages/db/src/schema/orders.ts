import { bigint, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tenantCol, ts } from './_shared.js';
import { tenants } from './tenants.js';
import { menuItems } from './catalog.js';

// docs/04-data-model.md §6. State machine: docs/01-system-design.md §4.3.
// draft → placed → pending → received → preparing → ready → collected
//   plus terminal: voided | abandoned | rejected
export const ORDER_STATUSES = [
  'draft',
  'placed',
  'pending',
  'received',
  'preparing',
  'ready',
  'collected',
  'voided',
  'abandoned',
  'rejected',
] as const;

export const orders = pgTable(
  'orders',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    orderNumber: text('order_number').notNull(), // per-tenant per-day sequence
    channel: text('channel').notNull(), // whatsapp | cashier
    customerId: uuid('customer_id'), // NULL for anonymous till orders
    tableLabel: text('table_label'), // free text, only if the café asks (FR-1.7)
    status: text('status').notNull(),
    subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull(),
    discountMinor: bigint('discount_minor', { mode: 'number' }).notNull().default(0),
    totalMinor: bigint('total_minor', { mode: 'number' }).notNull(), // INV-3
    paymentMethod: text('payment_method'), // cash | visa (recorded at collection)
    discountCodeId: uuid('discount_code_id'),
    promisedEtaLowerAt: ts('promised_eta_lower_at'),
    promisedEtaUpperAt: ts('promised_eta_upper_at'),
    acceptedAt: ts('accepted_at'),
    readyAt: ts('ready_at'),
    collectedAt: ts('collected_at'),
    createdByStaffId: uuid('created_by_staff_id'), // attribution (GAP-06)
    voidedByStaffId: uuid('voided_by_staff_id'),
    voidReason: text('void_reason'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('orders_tenant_idempotency_idx').on(t.tenantId, t.idempotencyKey),
    uniqueIndex('orders_tenant_number_idx').on(t.tenantId, t.orderNumber),
    index('orders_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('orders_tenant_status_idx').on(t.tenantId, t.status),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    qty: integer('qty').notNull(),
    // SNAPSHOT columns — Rule 2 (docs/04 §1). Yesterday's report must never change.
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
    modifierTotalMinor: bigint('modifier_total_minor', { mode: 'number' }).notNull(),
    lineTotalMinor: bigint('line_total_minor', { mode: 'number' }).notNull(),
    costSnapshotMinor: bigint('cost_snapshot_minor', { mode: 'number' }).notNull(),
    recipeVersionId: uuid('recipe_version_id').notNull(), // what was actually deducted
    menuPriceVersionId: uuid('menu_price_version_id').notNull(), // what was actually charged
    nameSnapshotEn: text('name_snapshot_en').notNull(),
    nameSnapshotAr: text('name_snapshot_ar'),
  },
  (t) => [index('order_items_tenant_item_order_idx').on(t.tenantId, t.menuItemId, t.orderId)],
);

export const orderItemModifiers = pgTable('order_item_modifiers', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  orderItemId: uuid('order_item_id')
    .notNull()
    .references(() => orderItems.id),
  modifierOptionId: uuid('modifier_option_id').notNull(),
  nameSnapshotEn: text('name_snapshot_en').notNull(),
  nameSnapshotAr: text('name_snapshot_ar'),
  priceDeltaMinor: bigint('price_delta_minor', { mode: 'number' }).notNull(), // SNAPSHOT
});
