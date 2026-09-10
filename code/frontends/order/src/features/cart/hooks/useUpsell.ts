import { useEffect, useState } from 'react';
import type { MenuItem } from '@veyroxai/contracts';
import { useCart } from '../../../shared/cart-store.js';
import { loadUpsell } from '../repo/upsellRepo.js';

const SEEN_KEY = 'vx.upsell.seen';

function seen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markUpsellSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

/**
 * The add-on to suggest in the cart, or `null`. Shown once per session (FR-2.12),
 * after the first item is added, and never for an item already in the cart.
 */
export function useUpsell(): MenuItem | null {
  const cart = useCart();
  const [item, setItem] = useState<MenuItem | null>(null);

  const active = cart.count >= 1 && !seen();

  useEffect(() => {
    if (!active) return;
    let live = true;
    void loadUpsell().then((result) => {
      if (live) setItem(result);
    });
    return () => {
      live = false;
    };
  }, [active]);

  if (!active || !item) return null;
  if (cart.lines.some((line) => line.menuItemId === item.id)) return null;
  return item;
}
