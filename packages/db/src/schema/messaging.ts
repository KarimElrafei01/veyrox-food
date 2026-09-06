import { isNull } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, tenantCol, ts } from './_shared.js';
import { tenants, customers } from './tenants.js';

/** APPEND-ONLY. Provider retries deduplicate before any work reaches a worker. */
export const inboundEvents = pgTable(
  'inbound_events',
  {
    id: pk(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    rail: text('rail').notNull(), // official | habit
    providerMessageId: text('provider_message_id').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('inbound_events_rail_provider_message_idx').on(t.rail, t.providerMessageId),
    index('inbound_events_unprocessed_idx').on(t.receivedAt).where(isNull(t.processedAt)),
  ],
);

/** Suppressions are intentionally independent of customers so erasure cannot re-enable contact. */
export const customerSuppressions = pgTable(
  'customer_suppressions',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    phoneHash: text('phone_hash').notNull(),
    scope: text('scope').notNull(), // all | habit | marketing
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('customer_suppressions_tenant_phone_idx').on(t.tenantId, t.phoneHash)],
);

/** APPEND-ONLY metadata only: message bodies must never be stored. */
export const outboundMessages = pgTable(
  'outbound_messages',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    rail: text('rail').notNull(),
    customerId: uuid('customer_id').references(() => customers.id),
    phoneHash: text('phone_hash').notNull(),
    purpose: text('purpose').notNull(),
    templateName: text('template_name'),
    templateCategory: text('template_category'),
    bodyHash: text('body_hash').notNull(),
    status: text('status').notNull(),
    providerRef: text('provider_ref'),
    error: text('error'),
    createdAt: createdAt(),
    sentAt: ts('sent_at'),
  },
  (t) => [index('outbound_messages_tenant_customer_idx').on(t.tenantId, t.customerId, t.createdAt)],
);
