import type { QuoteResponse } from '@veyroxai/contracts';
import type { CartLine } from '../../../shared/cart-store.js';
import { requestQuote } from '../repo/quoteRepo.js';

interface Deps {
  requestQuote: typeof requestQuote;
}

/** Quote the current cart. An empty cart short-circuits to a zeroed quote — the
 *  initial state is not an error (F1.3 §5). */
export async function quoteCart(
  lines: CartLine[],
  deps: Deps = { requestQuote },
): Promise<QuoteResponse | null> {
  if (lines.length === 0) {
    return null;
  }
  return deps.requestQuote({
    items: lines.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      modifierOptionIds: l.modifierOptionIds,
    })),
  });
}

/**
 * Given a quote's `unavailable[]`, decide which cart lines to drop or strip
 * (F1.3 §2 / FR-2.7 — correct the cart, do not fail at checkout). Returns the ids
 * of lines to remove entirely.
 */
export function linesToRemove(lines: CartLine[], quote: QuoteResponse): string[] {
  if (quote.unavailable.length === 0) {
    return [];
  }
  const deadItems = new Set(
    quote.unavailable.filter((u) => u.reason === 'item_unavailable').map((u) => u.menuItemId),
  );
  const deadModifiers = new Set(
    quote.unavailable
      .filter((u) => u.reason === 'modifier_unavailable' && u.modifierOptionId)
      .map((u) => u.modifierOptionId as string),
  );
  return lines
    .filter(
      (l) => deadItems.has(l.menuItemId) || l.modifierOptionIds.some((id) => deadModifiers.has(id)),
    )
    .map((l) => l.lineId);
}
