import { z } from 'zod';

const cartLine = z.object({
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

export type QuoteOrderRequest = z.infer<typeof quoteOrderRequest>;
export type PlaceOrderRequest = z.infer<typeof placeOrderRequest>;
