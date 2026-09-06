import { z } from 'zod';

  const cartLine = z.object({
    menuItemId: z.uuid(),
    qty: z.number().int().min(1).max(20),
    modifierOptionIds: z.array(z.uuid()).max(20),
    /**
     * The server must echo this on quoted/unavailable lines when
     supplied, so the
     * client can distinguish duplicate menu-item lines.
     */
    clientLineId: z.string().max(64).optional(),
  });

  export type CartLineRequest = z.infer<typeof cartLine>;

  /** Price fields are intentionally absent: server-side pricing has no
  client price to trust. */
  export const quoteOrderRequest = z.object({
    items: z.array(cartLine).max(50),
  });

  export const placeOrderRequest = quoteOrderRequest.extend({
    expectedTotalMinor: z.number().int().nonnegative().optional(),
    tableLabel: z.string().trim().max(16).nullable().optional(),
    customerNote: z.string().trim().max(140).nullable().optional(),
  });

  export type QuoteOrderRequest = z.infer<typeof quoteOrderRequest>;
  export type PlaceOrderRequest = z.infer<typeof placeOrderRequest>;

  /**
   * POST /public/session/locale.
   *
   * `sequence` is monotonic per customer. Delayed requests with an older
   sequence
   * are accepted idempotently but cannot overwrite a newer locale choice.
   */
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