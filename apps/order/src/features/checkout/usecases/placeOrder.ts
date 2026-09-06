import { v7 as uuidv7 } from 'uuid';
import { ApiError, NetworkError } from '@veyroxai/api-client';
import {
  openOrderLimitProblem,
  priceChangedProblem,
  type PlaceOrderRequest,
  type PlaceOrderResponse,
  type QuoteResponse,
} from '@veyroxai/contracts';
import type { CartLine } from '../../../shared/cart-store.js';
import { placeOrder as placeOrderCall } from '../repo/ordersRepo.js';

export type PlaceOutcome =
  | { kind: 'placed'; order: PlaceOrderResponse }
  | { kind: 'price_changed'; quote: QuoteResponse; detail: string }
  | { kind: 'open_order'; orderNumber: string; orderId: string }
  | { kind: 'item_unavailable' }
  | { kind: 'store_closed' }
  | { kind: 'suspended' }
  | { kind: 'min_order' }
  | { kind: 'session_expired' }
  | { kind: 'network' }
  | { kind: 'error'; code: string };

interface Deps {
  placeOrder: typeof placeOrderCall;
  newKey: () => string;
}

/**
 * Place the order. Generates the idempotency key once so a retry after a timeout
 * replays rather than double-orders (F1.6 §5). Maps every documented failure code
 * to a UI intent so the screen has one switch.
 */
export async function placeOrder(
  lines: CartLine[],
  opts: { expectedTotalMinor?: number; tableLabel?: string | null; customerNote?: string | null },
  deps: Deps = { placeOrder: placeOrderCall, newKey: uuidv7 },
): Promise<PlaceOutcome> {
  const request: PlaceOrderRequest = {
    items: lines.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      modifierOptionIds: l.modifierOptionIds,
    })),
    expectedTotalMinor: opts.expectedTotalMinor,
    tableLabel: opts.tableLabel ?? null,
    customerNote: opts.customerNote ?? null,
  };

  try {
    const order = await deps.placeOrder(request, deps.newKey());
    return { kind: 'placed', order };
  } catch (err) {
    return classify(err);
  }
}

function classify(err: unknown): PlaceOutcome {
  if (err instanceof NetworkError) {
    return { kind: 'network' };
  }
  if (!(err instanceof ApiError)) {
    return { kind: 'error', code: 'unknown' };
  }
  switch (err.code) {
    case 'PRICE_CHANGED': {
      const parsed = priceChangedProblem.safeParse(err.body);
      return parsed.success
        ? { kind: 'price_changed', quote: parsed.data.quote, detail: parsed.data.detail }
        : { kind: 'error', code: 'PRICE_CHANGED' };
    }
    case 'OPEN_ORDER_LIMIT': {
      const parsed = openOrderLimitProblem.safeParse(err.body);
      return parsed.success
        ? {
            kind: 'open_order',
            orderNumber: parsed.data.existingOrder.orderNumber,
            orderId: parsed.data.existingOrder.orderId,
          }
        : { kind: 'error', code: 'OPEN_ORDER_LIMIT' };
    }
    case 'ITEM_UNAVAILABLE':
      return { kind: 'item_unavailable' };
    case 'STORE_CLOSED':
      return { kind: 'store_closed' };
    case 'ORDERING_SUSPENDED':
      return { kind: 'suspended' };
    case 'MIN_ORDER_VALUE':
      return { kind: 'min_order' };
    case 'SESSION_EXPIRED':
    case 'SESSION_INVALID':
      return { kind: 'session_expired' };
    default:
      return { kind: 'error', code: err.code };
  }
}
