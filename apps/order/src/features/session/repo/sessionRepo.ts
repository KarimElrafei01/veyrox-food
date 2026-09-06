import type { HttpClient } from '@veyroxai/api-client';
import { sessionResolveResponse, type SessionResolveResponse } from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/** GET /public/session/:token (F1.1 §3). */
export function fetchSession(
  token: string,
  client: HttpClient = getApiClient(),
): Promise<SessionResolveResponse> {
  return client.get(`/public/session/${encodeURIComponent(token)}`, sessionResolveResponse);
}
