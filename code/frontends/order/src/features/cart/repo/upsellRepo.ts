import type { MenuItem } from '@veyroxai/contracts';
import { fetchUpsell } from '../datasource/upsellDatasource.js';
import { MOCK_UPSELL } from '../mockUpsell.js';

/**
 * The cart's add-on suggestion, or `null` when there is none.
 *
 * TODO(backend): `GET /public/upsell` does not exist yet — any failure falls back to a
 * mock so the card is visible while the endpoint is built. Delete the catch and
 * `mockUpsell.ts` once it lands.
 */
export async function loadUpsell(
  fetch: typeof fetchUpsell = fetchUpsell,
): Promise<MenuItem | null> {
  try {
    return (await fetch()).item;
  } catch {
    return MOCK_UPSELL;
  }
}
