import { useEffect, useState } from 'react';
import type { MenuItem } from '@veyroxai/contracts';
import { useCart } from '../../../shared/cart-store.js';
import { loadCrossSell } from '../usecases/loadCrossSell.js';

const SEEN_KEY = 'vx.crosssell.seen';

export function crossSellSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markCrossSellSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

type State =
  { status: 'loading' } | { status: 'empty' } | { status: 'ready'; pairings: MenuItem[] };

/**
 * Pairings for the current cart. `empty` (no data, or already seen this session) means
 * the cross-sell step is skipped entirely (FR-2.13).
 */
export function useCrossSell(): State {
  const cart = useCart();
  const itemKey = cart.lines
    .map((line) => line.menuItemId)
    .sort()
    .join(',');
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!itemKey || crossSellSeen()) {
      setState({ status: 'empty' });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    void loadCrossSell(itemKey.split(',')).then((pairings) => {
      if (!live) return;
      setState(pairings.length > 0 ? { status: 'ready', pairings } : { status: 'empty' });
    });
    return () => {
      live = false;
    };
  }, [itemKey]);

  return state;
}
