import { z } from 'zod';

const cartLine = z.object({
  /** Client-generated stable key used to reconcile this row with a quote response. */
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

export type QuoteOrderRequest = z.infer<typeof quoteOrderRequest>;
export type PlaceOrderRequest = z.infer<typeof placeOrderRequest>;

const etaEnvelope = z.object({
  lowerMinutes: z.number().int().nullable(),
  upperMinutes: z.number().int().nullable(),
  startsOnAccept: z.boolean(),
  promisedLowerAt: z.string().nullable(),
  promisedUpperAt: z.string().nullable(),
});

const pricedLine = z.object({
  clientLineId: z.uuid(),
  menuItemId: z.uuid(),
  qty: z.number().int(),
  unitPriceMinor: z.number().int(),
  modifierTotalMinor: z.number().int(),
  lineTotalMinor: z.number().int(),
});

/** F1.3 §2. Also returned inline inside a placement `PRICE_CHANGED` (F1.6 §2). */
export const quoteResponse = z.object({
  lines: z.array(pricedLine),
  subtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  totalMinor: z.number().int(),
  unavailable: z.array(
    z.object({
      clientLineId: z.uuid(),
      menuItemId: z.uuid(),
      modifierOptionId: z.uuid().optional(),
    }),
  ),
  eta: z.object({
    lowerMinutes: z.number().int(),
    upperMinutes: z.number().int(),
    queueDepth: z.number().int(),
  }),
  loyalty: z.object({
    pointsToEarn: z.number().int(),
    multiplier: z.number(),
    tier: z.enum(['bronze', 'silver', 'gold']).nullable(),
  }),
  payAt: z.literal('counter'),
});

/** F1.6 §2. The 201 body, and — byte-identical — the 200 replay body. */
export const placeOrderResponse = z.object({
  orderId: z.uuid(),
  orderNumber: z.string(),
  status: z.literal('placed'),
  totalMinor: z.number().int(),
  payAt: z.literal('counter'),
  eta: etaEnvelope,
  loyalty: z.object({ pointsToEarn: z.number().int() }),
  placedAt: z.string(),
});

export type QuoteResponse = z.infer<typeof quoteResponse>;
export type PlaceOrderResponse = z.infer<typeof placeOrderResponse>;

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
