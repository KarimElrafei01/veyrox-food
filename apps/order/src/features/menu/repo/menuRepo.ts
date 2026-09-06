import type { HttpClient } from '@veyroxai/api-client';
import {
  availabilityResponse,
  menuResponse,
  type AvailabilityResponse,
  type MenuResponse,
} from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/** GET /public/menu/:menuVersion (F1.2 §2) — immutable, CDN-cached by version. */
export function fetchMenu(
  menuVersion: string,
  client: HttpClient = getApiClient(),
): Promise<MenuResponse> {
  return client.get(`/public/menu/${encodeURIComponent(menuVersion)}`, menuResponse);
}

/** GET /public/availability (F1.2 §2) — the short 86 list, re-fetched on focus. */
export function fetchAvailability(
  client: HttpClient = getApiClient(),
): Promise<AvailabilityResponse> {
  return client.get('/public/availability', availabilityResponse);
}
