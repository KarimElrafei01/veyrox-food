import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, ts } from './_shared.js';
import { tenants } from './tenants.js';
import { orders } from './orders.js';

/**
 * APPEND-ONLY. The order audit log, and the source of the SSE replay stream
 * (`WHERE id > lastSeen`, ADR-0005). Every transition appends one row.
 *
 * `idempotencyKey` is the KDS mutation dedup mechanism (F2 backend doc §2.2):
 * two concurrent requests carrying the same key both attempt this insert inside
 * the same transaction that does the status change and ledger writes, so the
 * loser's unique-violation rolls back its whole transaction, not just this row —
 * the same `UNIQUE (tenant_id, idempotency_key)` shape already proven on `orders`
 * for placement, reused here rather than a bespoke per-endpoint dedup table.
 * NULL for events with no client-supplied key (system/job-sourced transitions).
 */
export const orderEvents = pgTable(
  'order_events',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorType: text('actor_type').notNull(), // customer | staff | system | webhook
    actorId: uuid('actor_id'),
    reason: text('reason'),
    source: text('source'), // till | kds | webview | job
    metadata: jsonb('metadata'),
    idempotencyKey: text('idempotency_key'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('order_events_tenant_order_idx').on(t.tenantId, t.orderId, t.id),
    uniqueIndex('order_events_tenant_idempotency_idx')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
  ],
);
