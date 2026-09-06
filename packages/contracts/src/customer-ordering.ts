import { z } from 'zod';

/**
 * F1 — Customer ordering, request contracts. IDs and quantities only — there is
 * no price field anywhere, by construction (F1.3 §1). Response schemas live in
 * `./customer-ordering-responses.ts`.
 */

const cartLine = z.object({
  menuItemId: z.uuid(),
  qty: z.number().int().min(1).max(20),
  modifierOptionIds: z.array(z.uuid()).max(20),
  /**
   * Opaque client-generated line id. The server echoes it on the matching
   * `quotedLine` / `unavailableLine` so the client can correlate quote results to
   * cart lines even when two lines share a `menuItemId` or an unavailable line is
   * omitted from `lines[]` (F1.3 §2). Optional so a server that ignores it still
   * validates.
   */
  clientLineId: z.string().max(64).optional(),
});
export type CartLineRequest = z.infer<typeof cartLine>;

/** Price fields are intentionally absent: server-side pricing has no client price to trust. */
export const quoteOrderRequest = z.object({ items: z.array(cartLine).max(50) });

export const placeOrderRequest = quoteOrderRequest.extend({
  expectedTotalMinor: z.number().int().nonnegative().optional(),
  tableLabel: z.string().trim().max(16).nullable().optional(),
  customerNote: z.string().trim().max(140).nullable().optional(),
});

export type QuoteOrderRequest = z.infer<typeof quoteOrderRequest>;
export type PlaceOrderRequest = z.infer<typeof placeOrderRequest>;

/**
 * `POST /public/session/locale` — persist the customer's language choice to
 * `customers.locale` (FR-2.4). Fire-and-forget from the webview; the resolved
 * locale is also carried on every request as `Accept-Language`.
 * NOTE: backend endpoint not yet implemented.
 */
export const updateLocaleRequest = z.object({ locale: z.enum(['en', 'ar-EG']) });
export type UpdateLocaleRequest = z.infer<typeof updateLocaleRequest>;
