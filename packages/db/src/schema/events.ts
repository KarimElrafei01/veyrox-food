import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pk, tenantCol, ts } from './_shared.js';
import { tenants } from './tenants.js';
import { orders } from './orders.js';

/**
 * APPEND-ONLY. The order audit log, and the source of the SSE replay stream
 * (`WHERE id > lastSeen`, ADR-0005). Every transition appends one row.
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
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('order_events_tenant_order_idx').on(t.tenantId, t.orderId, t.id)],
);
