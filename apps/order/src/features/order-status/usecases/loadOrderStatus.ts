import type { OrderStatusResponse } from '@veyroxai/contracts';
import { fetchOrderStatus } from '../repo/statusRepo.js';

export type CustomerStep = 'placed' | 'accepted' | 'preparing' | 'ready';

const STEP_INDEX: Record<string, number> = {
  placed: 0,
  received: 1,
  preparing: 2,
  ready: 3,
  collected: 3,
};

/** Which tracker node is active for a given internal status (F1.7 §3). */
export function trackerIndex(status: string): number {
  return STEP_INDEX[status] ?? 0;
}

/** Minutes remaining until `promisedUpperAt`, floored at zero (F1.7 §7 — never
 *  render "-2 min"). Returns null before Accept, when there is no promise yet. */
export function minutesRemaining(promisedUpperAt: string | null, now = Date.now()): number | null {
  if (!promisedUpperAt) {
    return null;
  }
  return Math.max(0, Math.ceil((new Date(promisedUpperAt).getTime() - now) / 60000));
}

export function rejectionKey(
  reason: 'too_busy' | 'item_unavailable' | 'closing',
): 'status.rejectedTooBusy' | 'status.rejectedItemUnavailable' | 'status.rejectedClosing' {
  return reason === 'too_busy'
    ? 'status.rejectedTooBusy'
    : reason === 'item_unavailable'
      ? 'status.rejectedItemUnavailable'
      : 'status.rejectedClosing';
}

interface Deps {
  fetchOrderStatus: typeof fetchOrderStatus;
}

export async function loadOrderStatus(
  orderId: string,
  deps: Deps = { fetchOrderStatus },
): Promise<OrderStatusResponse> {
  return deps.fetchOrderStatus(orderId);
}
