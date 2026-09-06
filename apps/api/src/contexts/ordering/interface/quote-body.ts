import {
  estimateEta,
  previewPoints,
  type EtaCartItem,
  type LoyaltyTier,
  type PricedCart,
} from '@veyroxai/domain';
import type { QuoteResponse } from '@veyroxai/contracts';
import type { EtaQueueState } from '../infrastructure/eta-queue-repository.js';

export type PricedForQuote = Pick<
  PricedCart,
  'lines' | 'subtotalMinor' | 'discountMinor' | 'totalMinor' | 'unavailable'
> & { etaItems: readonly EtaCartItem[] };

/**
 * The F1.3 §2 quote body. Shared verbatim by `/public/orders/quote` and by the
 * `PRICE_CHANGED` branch of `/public/orders`, so a customer who hits a stale price
 * re-renders from the same shape without a second round-trip (F1.6 §2).
 */
export function assembleQuoteBody(
  priced: PricedForQuote,
  queue: { state: EtaQueueState; source: 'redis' | 'postgres' | 'degraded' },
  tier: LoyaltyTier | null,
  now: Date,
): QuoteResponse {
  const eta = estimateEta(
    priced.etaItems,
    queue.state.tickets,
    tier,
    queue.state.activeStations,
    now,
    queue.source === 'degraded' ? 1.5 : 1.25,
  );
  return {
    lines: priced.lines.map((line) => ({
      menuItemId: line.menuItemId,
      qty: line.qty,
      unitPriceMinor: line.unitPriceMinor,
      modifierTotalMinor: line.modifierTotalMinor,
      lineTotalMinor: line.lineTotalMinor,
    })),
    subtotalMinor: priced.subtotalMinor,
    discountMinor: priced.discountMinor,
    totalMinor: priced.totalMinor,
    unavailable: priced.unavailable.map((entry) => ({
      menuItemId: entry.menuItemId,
      ...(entry.modifierOptionId ? { modifierOptionId: entry.modifierOptionId } : {}),
    })),
    eta,
    loyalty: { ...previewPoints(priced.totalMinor, tier), tier },
    payAt: 'counter',
  };
}
