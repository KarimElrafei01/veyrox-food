import type { HttpClient } from '@veyroxai/api-client';
import { upsellResponse, type UpsellResponse } from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/** GET /public/upsell (FR-2.12) — one café-flagged add-on, or `{ item: null }`. */
export function fetchUpsell(client: HttpClient = getApiClient()): Promise<UpsellResponse> {
  return client.get('/public/upsell', upsellResponse);
}
