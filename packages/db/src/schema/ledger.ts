import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { index, integer, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, ts } from './_shared.js';
import { tenants } from './tenants.js';
import { rawMaterials } from './catalog.js';
import { orders } from './orders.js';
import { customers } from './tenants.js';

/**
 * The material ledger — the heart of G4 (docs/04-data-model.md §7).
 *
 * APPEND-ONLY. There is no stock_on_hand column and no UPDATE that changes a
 * quantity. Every movement is an insert with a signed `qty_delta`.
 *
 * VOIDING NEGATES THE EXACT ROWS THE ORDER CREATED. It never recomputes from
 * `recipes`. If it recomputed, a recipe edited between send-time and void-time
 * would return the wrong quantity — silently, permanently, cumulatively. This is
 * the one line of design that makes PRD §8.4's "exact equality" real, and it must
 * never be "simplified" into a recipe lookup (CLAUDE.md — Non-negotiables).
 *
 * The void routine, for reference (docs/04 §7) — a sign flip, nothing more:
 *
 *   INSERT INTO material_ledger (..., qty_delta, reason, reverses_ledger_id, ...)
 *   SELECT ..., -qty_delta, 'void_return', id, ...
 *   FROM material_ledger
 *   WHERE tenant_id = :t AND order_id = :o AND reason = 'sale_deduction';
 *
 * The partial unique index on `reverses_ledger_id` makes a double-void physically
 * impossible even if the application idempotency layer fails.
 */
export const materialLedger = pgTable(
  'material_ledger',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    materialId: uuid('material_id')
      .notNull()
      .references(() => rawMaterials.id),
    qtyDelta: numeric('qty_delta', { precision: 14, scale: 6 }).notNull(), // negative = consumed
    reason: text('reason').notNull(), // sale_deduction | void_return | refund_return | waste | manual_adjustment
    orderId: uuid('order_id').references(() => orders.id),
    orderItemId: uuid('order_item_id'),
    reversesLedgerId: uuid('reverses_ledger_id').references((): AnyPgColumn => materialLedger.id),
    recipeVersionId: uuid('recipe_version_id'),
    unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 14, scale: 6 }),
    actorType: text('actor_type'),
    actorId: uuid('actor_id'),
    note: text('note'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    // A row can be reversed at most once (docs/04 §7).
    uniqueIndex('material_ledger_reverses_idx')
      .on(t.reversesLedgerId)
      .where(sql`reverses_ledger_id IS NOT NULL`),
    index('material_ledger_tenant_order_idx').on(t.tenantId, t.orderId),
    index('material_ledger_tenant_material_created_idx').on(t.tenantId, t.materialId, t.createdAt),
  ],
);

/** APPEND-ONLY: balances are cached for reads but every point movement remains auditable. */
export const loyaltyLedger = pgTable(
  'loyalty_ledger',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    orderId: uuid('order_id').references(() => orders.id),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('loyalty_ledger_tenant_customer_created_idx').on(t.tenantId, t.customerId, t.createdAt),
  ],
);
