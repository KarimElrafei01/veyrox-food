import type { HttpClient } from '@veyroxai/api-client';
import { pairingsResponse, type PairingsResponse } from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/**
 * GET /public/pairings?items=<id,id> (FR-2.13) — "frequently bought together" for the
 * cart's contents. Empty when the co-occurrence data is too thin.
 */
export function fetchPairings(
  cartItemIds: string[],
  client: HttpClient = getApiClient(),
): Promise<PairingsResponse> {
  const query = new URLSearchParams({ items: cartItemIds.join(',') });
  return client.get(`/public/pairings?${query.toString()}`, pairingsResponse);
}
