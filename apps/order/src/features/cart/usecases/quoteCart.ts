import type { QuotedLine, QuoteResponse } from '@veyroxai/contracts';
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
      clientLineId: l.lineId,
      menuItemId: l.menuItemId,
      qty: l.qty,
      modifierOptionIds: l.modifierOptionIds,
    })),
  });
}

/**
 * Correlate a quoted line to a cart line by the echoed `clientLineId`
 * (F1.3 §2). Falls back to positional alignment among the *available* lines when
 * a legacy server does not echo the id — two lines with the same `menuItemId` and
 * different modifiers must never collide.
 */
export function quotedLineFor(
  quote: QuoteResponse,
  line: CartLine,
  allLines: CartLine[],
): QuotedLine | null {
  const byId = quote.lines.find((q) => q.clientLineId === line.lineId);
  if (byId) {
    return byId;
  }
  const deadIds = new Set(
    quote.unavailable.map((u) => u.clientLineId).filter((id): id is string => id != null),
  );
  const availableInOrder = allLines.filter((l) => !deadIds.has(l.lineId));
  const idx = availableInOrder.findIndex((l) => l.lineId === line.lineId);
  return idx >= 0 ? (quote.lines[idx] ?? null) : null;
}

export interface Reconciliation {
  /** Lines whose menu item is gone — removed from the cart. */
  removeLineIds: string[];
  /** Lines whose item is fine but a chosen modifier is gone — kept, flagged to reconfigure. */
  reconfigureLineIds: string[];
}

/**
 * Decide how to correct the cart from a quote's `unavailable[]` (FR-2.7): drop a
 * line only when the drink itself is unavailable; when just a modifier went out,
 * keep the drink and prompt the customer to reconfigure it.
 */
export function reconcileQuote(lines: CartLine[], quote: QuoteResponse): Reconciliation {
  const removeLineIds: string[] = [];
  const reconfigureLineIds: string[] = [];
  if (quote.unavailable.length === 0) {
    return { removeLineIds, reconfigureLineIds };
  }

  const deadItems = new Set(
    quote.unavailable.filter((u) => u.reason === 'item_unavailable').map((u) => u.menuItemId),
  );
  const deadModifierByLine = new Map<string, Set<string>>();
  const deadModifierByItem = new Map<string, Set<string>>();
  const addTo = (map: Map<string, Set<string>>, key: string, value: string): void => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };
  for (const u of quote.unavailable) {
    if (u.reason !== 'modifier_unavailable' || !u.modifierOptionId) {
      continue;
    }
    if (u.clientLineId) {
      addTo(deadModifierByLine, u.clientLineId, u.modifierOptionId);
    } else {
      addTo(deadModifierByItem, u.menuItemId, u.modifierOptionId);
    }
  }

  for (const line of lines) {
    if (deadItems.has(line.menuItemId)) {
      removeLineIds.push(line.lineId);
      continue;
    }
    const deadForLine =
      deadModifierByLine.get(line.lineId) ?? deadModifierByItem.get(line.menuItemId);
    if (deadForLine && line.modifierOptionIds.some((id) => deadForLine.has(id))) {
      reconfigureLineIds.push(line.lineId);
    }
  }
  return { removeLineIds, reconfigureLineIds };
}
