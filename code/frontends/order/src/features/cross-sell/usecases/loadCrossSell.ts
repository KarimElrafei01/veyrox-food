import type { MenuItem } from '@veyroxai/contracts';
import { fetchPairingsFor } from '../repo/pairingsRepo.js';

/** Pairings to show: not already in the cart, capped at three (design 2.5). */
export async function loadCrossSell(
  cartItemIds: string[],
  fetch: typeof fetchPairingsFor = fetchPairingsFor,
): Promise<MenuItem[]> {
  const inCart = new Set(cartItemIds);
  const pairings = await fetch(cartItemIds);
  return pairings.filter((item) => !inCart.has(item.id)).slice(0, 3);
}
