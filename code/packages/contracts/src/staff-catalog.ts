import { z } from 'zod';
import { localeMap } from './customer-ordering-responses.js';

/**
 * F2 backend doc §6 - what the KDS 86 drawer reads. A staff-scoped equivalent
 * of the customer-facing menu contracts (customer-ordering-responses.ts), but
 * sourced from the *current* live catalog (not one immutable published
 * version) and carrying isAvailable directly on items/options, since
 * surfacing and toggling that flag is this endpoint's whole purpose. Items
 * are a flat array with categoryId (not nested under category) so a barista
 * can search across all items with category as a filter dimension, per the
 * frontend doc's "search box + category filter pills" - not a rigid grouping.
 */

export const staffMenuOption = z.object({
  id: z.uuid(),
  name: localeMap,
  priceDeltaMinor: z.number().int(),
  isAvailable: z.boolean(),
});
export type StaffMenuOption = z.infer<typeof staffMenuOption>;

export const staffMenuModifierGroup = z.object({
  id: z.uuid(),
  name: localeMap,
  selection: z.enum(['single', 'multi']),
  required: z.boolean(),
  options: z.array(staffMenuOption),
});
export type StaffMenuModifierGroup = z.infer<typeof staffMenuModifierGroup>;

export const staffMenuItem = z.object({
  id: z.uuid(),
  categoryId: z.uuid().nullable(),
  sort: z.number().int(),
  name: localeMap,
  basePriceMinor: z.number().int().nonnegative().nullable(), // null: no active price row
  imageObjectKey: z.string().nullable(),
  isAvailable: z.boolean(),
  modifierGroupIds: z.array(z.uuid()),
});
export type StaffMenuItem = z.infer<typeof staffMenuItem>;

export const staffMenuCategory = z.object({
  id: z.uuid(),
  name: localeMap,
  sort: z.number().int(),
});
export type StaffMenuCategory = z.infer<typeof staffMenuCategory>;

export const staffMenuResponse = z.object({
  categories: z.array(staffMenuCategory),
  items: z.array(staffMenuItem),
  modifierGroups: z.array(staffMenuModifierGroup),
  traceId: z.string(),
});
export type StaffMenuResponse = z.infer<typeof staffMenuResponse>;
