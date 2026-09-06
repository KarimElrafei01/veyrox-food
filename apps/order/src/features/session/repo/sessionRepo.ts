import type { HttpClient } from '@veyroxai/api-client';
import {
  sessionResolveResponse,
  updateLocaleRequest,
  type SessionResolveResponse,
} from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/** GET /public/session/:token (F1.1 §3). */
export function fetchSession(
  token: string,
  client: HttpClient = getApiClient(),
): Promise<SessionResolveResponse> {
  return client.get(`/public/session/${encodeURIComponent(token)}`, sessionResolveResponse);
}

/**
 * POST /public/session/locale — persist the customer's language choice to
 * `customers.locale` (FR-2.4). Fire-and-forget; a failure never blocks the UI,
 * which has already switched and stored the choice locally.
 * NOTE: backend endpoint not yet implemented — see contracts.
 */
export async function updateLocalePreference(
  locale: 'en' | 'ar-EG',
  client: HttpClient = getApiClient(),
): Promise<void> {
  try {
    await client.post('/public/session/locale', {
      body: updateLocaleRequest.parse({ locale }),
    });
  } catch {
    /* best effort */
  }
}
