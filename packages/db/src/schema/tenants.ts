import { boolean, char, integer, pgTable, text, time, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, pk, tenantCol, ts, updatedAt } from './_shared.js';

// docs/04-data-model.md §3.
export const tenants = pgTable('tenants', {
  id: pk(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('Africa/Cairo'),
  currency: char('currency', { length: 3 }).notNull().default('EGP'),
  defaultLocale: text('default_locale').notNull().default('en'), // Q5: English-primary
  posMode: text('pos_mode').notNull().default('no_pos'), // no_pos | has_pos
  taxRegistrationNumber: text('tax_registration_number'), // e-invoicing readiness
  waPhoneNumberId: text('wa_phone_number_id'),
  qrToken: text('qr_token').unique(), // ONE store QR (FR-1.1, DEC-01)
  qrTokenPrevious: text('qr_token_previous'), // honoured during the 30-day grace window
  qrTokenRotatedAt: ts('qr_token_rotated_at'),
  status: text('status').notNull().default('active'), // active | suspended
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const storeHours = pgTable(
  'store_hours',
  {
    id: pk(),
    tenantId: tenantCol().references(() => tenants.id),
    weekday: integer('weekday').notNull(), // 0..6
    opens: time('opens').notNull(),
    closes: time('closes').notNull(),
    crossesMidnight: boolean('crosses_midnight').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('store_hours_tenant_weekday_idx').on(t.tenantId, t.weekday)],
);

export const storeClosures = pgTable('store_closures', {
  id: pk(),
  tenantId: tenantCol().references(() => tenants.id),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  reason: text('reason'),
  createdAt: createdAt(),
});
