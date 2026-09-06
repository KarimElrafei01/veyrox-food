import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
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
    orderNumber: text('order_number').notNull(), // per-tenant per-day sequence, e.g. A-047
    // The Cairo calendar day the order belongs to. Stored, not derived, because the
    // shouted `order_number` resets daily and its uniqueness is only per business day.
    businessDate: date('business_date').notNull(),
    channel: text('channel').notNull(), // whatsapp | cashier
    customerId: uuid('customer_id'), // NULL for anonymous till orders
    tableLabel: text('table_label'), // free text, only if the café asks (FR-1.7)
    customerNote: text('customer_note'),
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
    // Set by kitchen reject (F2). Customer-facing reason only: too_busy | item_unavailable | closing.
    rejectionReason: text('rejection_reason'),
    rejectedAt: ts('rejected_at'),
    idempotencyKey: text('idempotency_key').notNull(),
    // The exact response body returned when this order was first placed. A replay
    // must be byte-identical (F1.6 §5) — re-deriving it could differ once the queue
    // moves. NULL for orders created outside the public placement path (e.g. till).
    placementResponse: jsonb('placement_response'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('orders_tenant_idempotency_idx').on(t.tenantId, t.idempotencyKey),
    uniqueIndex('orders_tenant_number_idx').on(t.tenantId, t.businessDate, t.orderNumber),
    index('orders_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('orders_tenant_status_idx').on(t.tenantId, t.status),
    index('orders_open_customer_idx')
      .on(t.tenantId, t.customerId, t.status)
      .where(sql`status in ('placed', 'received', 'preparing', 'ready')`),
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

/**
 * One row per (tenant, Cairo day). Placement bumps `next_seq` with an upsert that
 * `RETURNING`s the number it took, so concurrent placements serialise on this row
 * rather than racing the `orders` unique index. Resets implicitly each day because
 * a new day has no row yet. Not append-only — the counter is state, not history.
 */
export const orderNumberCounters = pgTable(
  'order_number_counters',
  {
    tenantId: tenantCol().references(() => tenants.id),
    businessDate: date('business_date').notNull(),
    nextSeq: integer('next_seq').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.businessDate] })],
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
