import type { MenuItem } from '@veyroxai/contracts';
import { fetchPairings } from '../datasource/pairingsDatasource.js';
import { MOCK_PAIRINGS } from '../mockPairings.js';

/**
 * Raw pairing suggestions for the cart.
 *
 * TODO(backend): `GET /public/pairings` does not exist yet — any failure falls back to a
 * mock. Delete the catch and `mockPairings.ts` once it lands.
 */
export async function fetchPairingsFor(
  cartItemIds: string[],
  fetch: typeof fetchPairings = fetchPairings,
): Promise<MenuItem[]> {
  try {
    return (await fetch(cartItemIds)).pairings;
  } catch {
    return MOCK_PAIRINGS;
  }
}
