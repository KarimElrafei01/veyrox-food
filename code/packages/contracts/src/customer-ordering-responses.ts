import { z } from 'zod';

/**
 * F1 — Customer ordering, response contracts for the `/public/*` endpoints
 * (docs/features/F1-customer-ordering/). Request schemas: `./customer-ordering.ts`.
 */

// — shared —

export const localeMap = z.object({ en: z.string(), 'ar-EG': z.string().optional() });
export type LocaleMap = z.infer<typeof localeMap>;

export const loyaltyTier = z.enum(['bronze', 'silver', 'gold']);
export type LoyaltyTier = z.infer<typeof loyaltyTier>;

export const payAt = z.literal('counter');

export const etaBrief = z.object({
  lowerMinutes: z.number().int().nonnegative(),
  upperMinutes: z.number().int().nonnegative(),
  queueDepth: z.number().int().nonnegative().optional(),
});

export const etaPromise = z.object({
  lowerMinutes: z.number().int().nonnegative(),
  upperMinutes: z.number().int().nonnegative(),
  startsOnAccept: z.boolean(),
  promisedLowerAt: z.string().datetime({ offset: true }).nullable(),
  promisedUpperAt: z.string().datetime({ offset: true }).nullable(),
});

export const loyaltyQuote = z.object({
  pointsToEarn: z.number().int().nonnegative(),
  tier: loyaltyTier.nullable(),
  multiplier: z.number().positive().optional(),
});

/** Every machine `code` F1 can return (F1 README §5). Clients switch on these. */
export const orderErrorCode = z.enum([
  'SESSION_EXPIRED',
  'SESSION_INVALID',
  'STORE_CLOSED',
  'ITEM_UNAVAILABLE',
  'MODIFIER_GROUP_REQUIRED',
  'MODIFIER_SELECTION_INVALID',
  'MENU_VERSION_GONE',
  'PRICE_CHANGED',
  'OPEN_ORDER_LIMIT',
  'ORDERING_SUSPENDED',
  'MIN_ORDER_VALUE',
  'WHATSAPP_ORDERING_DISABLED',
]);
export type OrderErrorCode = z.infer<typeof orderErrorCode>;

// — GET /public/session/:token (F1.1 §3) —

export const sessionResolveResponse = z.object({
  tenant: z.object({
    id: z.uuid(),
    name: z.string(),
    defaultLocale: z.string(),
    supportedLocales: z.array(z.string()),
    currency: z.string(),
    timezone: z.string(),
  }),
  session: z.object({
    menuVersion: z.uuid(),
    expiresAt: z.string().datetime({ offset: true }),
    locale: z.string(),
  }),
  customer: z.object({
    displayName: z.string().nullable(),
    tier: loyaltyTier.nullable(),
    pointsBalance: z.number().int().nonnegative(),
    pointsToNextTier: z.number().int().nonnegative().nullable(),
    perks: z.array(z.string()),
  }),
  store: z.object({
    isOpen: z.boolean(),
    closesAt: z.string().datetime({ offset: true }).nullable(),
    opensAt: z.string().datetime({ offset: true }).nullable().optional(),
  }),
  ordering: z.object({
    enabled: z.boolean(),
    askTableNumber: z.boolean(),
    minOrderValueMinor: z.number().int().nonnegative(),
    payAt,
  }),
  links: z.object({ menu: z.string(), availability: z.string() }),
  /**
   * The customer's order still in progress, if any. One at a time (F1.6). The webview
   * sends a re-entering customer straight to its live status instead of the menu.
   */
  openOrder: z
    .object({
      orderId: z.uuid(),
      orderNumber: z.string(),
      status: z.enum(['placed', 'received', 'preparing', 'ready']),
    })
    .nullable(),
  traceId: z.string(),
});
export type SessionResolveResponse = z.infer<typeof sessionResolveResponse>;

// — GET /public/menu/:menuVersion (F1.2 §2) —

export const menuOption = z.object({
  id: z.uuid(),
  name: localeMap,
  priceDeltaMinor: z.number().int(),
  freeForTier: loyaltyTier.nullable(),
  sort: z.number().int(),
});

export const menuModifierGroup = z.object({
  id: z.uuid(),
  name: localeMap,
  selection: z.enum(['single', 'multi']),
  required: z.boolean(),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().nonnegative(),
  options: z.array(menuOption),
});

export const menuItem = z.object({
  id: z.uuid(),
  sort: z.number().int(),
  name: localeMap,
  description: localeMap.nullable(),
  basePriceMinor: z.number().int().nonnegative(),
  prepSeconds: z.number().int().nonnegative(),
  imageUrl: z.string().nullable(),
  modifierGroupIds: z.array(z.uuid()),
});

export const menuCategory = z.object({
  id: z.uuid(),
  sort: z.number().int(),
  name: localeMap,
  items: z.array(menuItem),
});

export const menuResponse = z.object({
  menuVersion: z.uuid(),
  publishedAt: z.string().datetime({ offset: true }),
  categories: z.array(menuCategory),
  modifierGroups: z.array(menuModifierGroup),
});
export type MenuResponse = z.infer<typeof menuResponse>;
export type MenuItem = z.infer<typeof menuItem>;
export type MenuModifierGroup = z.infer<typeof menuModifierGroup>;
export type MenuCategory = z.infer<typeof menuCategory>;

// — GET /public/availability (F1.2 §2) —

export const availabilityResponse = z.object({
  menuVersion: z.uuid(),
  unavailableItemIds: z.array(z.uuid()),
  unavailableModifierOptionIds: z.array(z.uuid()),
  asOf: z.string().datetime({ offset: true }),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponse>;

// — POST /public/orders/quote (F1.3 §2) —

export const quotedModifier = z.object({
  id: z.uuid(),
  priceDeltaMinor: z.number().int(),
  waivedByTier: z.boolean(),
});

export const quotedLine = z.object({
  /** Echoes the request line's `clientLineId` (F1.3 §2). */
  clientLineId: z.uuid(),
  menuItemId: z.uuid(),
  qty: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
  modifierTotalMinor: z.number().int(),
  lineTotalMinor: z.number().int().nonnegative(),
  modifiers: z.array(quotedModifier),
});

export const unavailableLine = z.object({
  /** Echoes the request line's `clientLineId` so the client corrects the right line. */
  clientLineId: z.uuid(),
  menuItemId: z.uuid(),
  modifierOptionId: z.uuid().optional(),
  reason: z.enum(['item_unavailable', 'modifier_unavailable']),
});

export const quoteResponse = z.object({
  lines: z.array(quotedLine),
  subtotalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  eta: etaBrief,
  loyalty: loyaltyQuote,
  unavailable: z.array(unavailableLine),
  payAt,
  traceId: z.string(),
});
export type QuoteResponse = z.infer<typeof quoteResponse>;
export type QuotedLine = z.infer<typeof quotedLine>;
export type UnavailableLine = z.infer<typeof unavailableLine>;

// — POST /public/orders (F1.6 §2) —

export const placeOrderResponse = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.literal('placed'),
  totalMinor: z.number().int().nonnegative(),
  payAt,
  eta: etaPromise,
  loyalty: z.object({ pointsToEarn: z.number().int().nonnegative() }),
  placedAt: z.string().datetime({ offset: true }),
  traceId: z.string(),
});
export type PlaceOrderResponse = z.infer<typeof placeOrderResponse>;

/** 409 PRICE_CHANGED carries a fresh quote so the client re-confirms in one round-trip. */
export const priceChangedProblem = z.object({
  code: z.literal('PRICE_CHANGED'),
  status: z.literal(409),
  detail: z.string(),
  quote: quoteResponse,
});
export type PriceChangedProblem = z.infer<typeof priceChangedProblem>;

/** 409 OPEN_ORDER_LIMIT returns the existing order so "where is my other order?" is answered. */
export const openOrderLimitProblem = z.object({
  code: z.literal('OPEN_ORDER_LIMIT'),
  status: z.literal(409),
  detail: z.string(),
  existingOrder: z.object({
    orderId: z.string(),
    orderNumber: z.string(),
    status: z.string(),
  }),
});
export type OpenOrderLimitProblem = z.infer<typeof openOrderLimitProblem>;

// — GET /public/orders/:orderId/status (F1.7 §2) —

const statusBase = {
  orderId: z.string(),
  orderNumber: z.string(),
  statusLabel: localeMap,
  totalMinor: z.number().int().nonnegative(),
  payAt,
  placedAt: z.string().datetime({ offset: true }),
  traceId: z.string(),
};

export const orderStatusResponse = z.discriminatedUnion('status', [
  z.object({
    ...statusBase,
    status: z.enum(['placed']),
    eta: etaPromise,
    loyalty: z.object({ pointsToEarn: z.number().int().nonnegative() }),
  }),
  z.object({
    ...statusBase,
    status: z.enum(['received', 'preparing', 'ready', 'collected']),
    eta: etaPromise,
    acceptedAt: z.string().datetime({ offset: true }).nullable(),
    readyAt: z.string().datetime({ offset: true }).nullable().optional(),
    collectedAt: z.string().datetime({ offset: true }).nullable().optional(),
  }),
  z.object({
    ...statusBase,
    status: z.literal('rejected'),
    rejectionReason: z.enum(['too_busy', 'item_unavailable', 'closing']),
    rejectedAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    ...statusBase,
    status: z.enum(['voided', 'abandoned']),
  }),
]);
export type OrderStatusResponse = z.infer<typeof orderStatusResponse>;

/**
 * `GET /public/upsell` — one add-on suggestion for the cart (FR-2.12), or `null` when the
 * café has flagged none. Shown once per session after the first item is added.
 */
export const upsellResponse = z.object({ item: menuItem.nullable() });
export type UpsellResponse = z.infer<typeof upsellResponse>;

/**
 * `GET /public/pairings` — "frequently bought together" items for the cart's contents
 * (FR-2.13), from order co-occurrence. Empty when the data is too thin to be meaningful,
 * in which case the cross-sell screen is not shown.
 */
export const pairingsResponse = z.object({ pairings: z.array(menuItem) });
export type PairingsResponse = z.infer<typeof pairingsResponse>;
