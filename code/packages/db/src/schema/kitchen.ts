import { sql } from 'drizzle-orm';
import { check, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

// docs/04-data-model.md §6 "kitchen_state" (F2 backend doc §5). One row per
// tenant - operational state a barista writes multiple times a shift, not
// audit history like order_events/material_ledger. Deliberately NOT modeled
// through the ADR-0015 settings resolver: that mechanism is for configuration
// a device *reads* to decide behavior, not fast-changing state a human writes.
export const kitchenState = pgTable(
  'kitchen_state',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id),
    activeStations: integer('active_stations').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedByStaffId: uuid('updated_by_staff_id'),
  },
  (t) => [check('kitchen_state_active_stations_range', sql`${t.activeStations} BETWEEN 1 AND 12`)],
);
