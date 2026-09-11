import type { HttpClient } from '@veyroxai/api-client';
import {
  availabilityResponse,
  menuResponse,
  type AvailabilityResponse,
  type MenuResponse,
} from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';
import { cacheMenu, readCachedMenu } from './menu-cache.js';

/**
 * GET the menu — immutable, CDN-cached by version. The path is
 * `session.links.menu`, returned by the server rather than constructed here, so
 * the client can never request a version it was not granted (F1.1 §3).
 */
export async function fetchMenu(
  menuLink: string,
  client: HttpClient = getApiClient(),
): Promise<MenuResponse> {
  const cached = await readCachedMenu(menuLink);
  if (cached) {
    return cached;
  }

  const menu = await client.get(menuLink, menuResponse);
  void cacheMenu(menuLink, menu);
  return menu;
}

/** GET the availability list — `session.links.availability`, re-fetched on focus. */
export function fetchAvailability(
  availabilityLink: string,
  client: HttpClient = getApiClient(),
): Promise<AvailabilityResponse> {
  return client.get(availabilityLink, availabilityResponse);
}
