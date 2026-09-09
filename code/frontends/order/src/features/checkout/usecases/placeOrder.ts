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
  | { kind: 'menu_gone' }
  | { kind: 'needs_review' }
  | { kind: 'store_closed' }
  | { kind: 'suspended' }
  | { kind: 'min_order' }
  | { kind: 'session_expired' }
  | { kind: 'network' }
  | { kind: 'error'; code: string };

/** True when the same idempotency key should be reused on the next attempt — i.e.
 *  the request may or may not have reached the server and a replay is safe. */
export function isRetryable(outcome: PlaceOutcome): boolean {
  return outcome.kind === 'network';
}

interface Deps {
  placeOrder: typeof placeOrderCall;
}

/**
 * Place the order with a caller-supplied idempotency key. The key is generated
 * once per placement attempt and **retained across retries** by `usePlaceOrder`,
 * so a retry after a timeout replays the original request rather than creating a
 * second unpaid order (F1.6 §5). Maps every documented failure code to a UI intent.
 */
export async function placeOrder(
  lines: CartLine[],
  opts: { expectedTotalMinor?: number; tableLabel?: string | null; customerNote?: string | null },
  idempotencyKey: string,
  deps: Deps = { placeOrder: placeOrderCall },
): Promise<PlaceOutcome> {
  const request: PlaceOrderRequest = {
    items: lines.map((l) => ({
      clientLineId: l.lineId,
      menuItemId: l.menuItemId,
      qty: l.qty,
      modifierOptionIds: l.modifierOptionIds,
    })),
    expectedTotalMinor: opts.expectedTotalMinor,
    tableLabel: opts.tableLabel ?? null,
    customerNote: opts.customerNote ?? null,
  };

  try {
    const order = await deps.placeOrder(request, idempotencyKey);
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
    case 'MENU_VERSION_GONE':
      return { kind: 'menu_gone' };
    case 'MODIFIER_GROUP_REQUIRED':
    case 'MODIFIER_SELECTION_INVALID':
      return { kind: 'needs_review' };
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
