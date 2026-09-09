import { z } from 'zod';

const cartLine = z.object({
  /** Identifies a draft-cart row even when another row has the same menu item. */
  clientLineId: z.uuid(),
  menuItemId: z.uuid(),
  qty: z.number().int().min(1).max(20),
  modifierOptionIds: z.array(z.uuid()).max(20),
});

/** Price fields are intentionally absent: server-side pricing has no client price to trust. */
export const quoteOrderRequest = z.object({ items: z.array(cartLine).max(50) });

export const placeOrderRequest = quoteOrderRequest.extend({
  expectedTotalMinor: z.number().int().nonnegative().optional(),
  tableLabel: z.string().trim().max(16).nullable().optional(),
  customerNote: z.string().trim().max(140).nullable().optional(),
});

export type CartLineRequest = z.infer<typeof cartLine>;
export type QuoteOrderRequest = z.infer<typeof quoteOrderRequest>;
export type PlaceOrderRequest = z.infer<typeof placeOrderRequest>;

/** A monotonic client sequence stops an older, delayed toggle replacing a newer choice. */
export const updateLocaleRequest = z.object({
  locale: z.enum(['en', 'ar-EG']),
  sequence: z.number().int().nonnegative(),
});

export const updateLocaleResponse = z.object({
  locale: z.enum(['en', 'ar-EG']),
  sequence: z.number().int().nonnegative(),
});

export type UpdateLocaleRequest = z.infer<typeof updateLocaleRequest>;
export type UpdateLocaleResponse = z.infer<typeof updateLocaleResponse>;
