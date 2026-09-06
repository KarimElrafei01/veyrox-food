import { ApiError } from '@veyroxai/api-client';
import type { SessionResolveResponse } from '@veyroxai/contracts';
import { setApiLocale } from '../../../shared/api.js';
import { fetchSession } from '../repo/sessionRepo.js';

interface Deps {
  fetchSession: typeof fetchSession;
}

/**
 * Resolve the webview session. Aligns the API `Accept-Language` with the session
 * locale, and turns a feature-disabled session into the same error the API would
 * raise so the UI has one path to handle.
 */
export async function resolveSession(
  token: string,
  deps: Deps = { fetchSession },
): Promise<SessionResolveResponse> {
  const session = await deps.fetchSession(token);
  if (!session.ordering.enabled) {
    throw new ApiError(403, { code: 'WHATSAPP_ORDERING_DISABLED' }, null);
  }
  setApiLocale(session.session.locale);
  return session;
}
