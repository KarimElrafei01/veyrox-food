import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { SessionResolveResponse } from '@veyroxai/contracts';
import { ApiError, NetworkError } from '@veyroxai/api-client';
import { resolveSession } from '../features/session/usecases/resolveSession.js';
import { setAuthToken } from './api.js';
import {
  clearStoredCustomerSessionToken,
  storeCustomerSessionToken,
} from './customer-session-token.js';

export type SessionError =
  | { kind: 'store_closed'; opensAt: string | null }
  | { kind: 'ordering_suspended' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'disabled' }
  | { kind: 'network' }
  | { kind: 'unknown' };

interface SessionState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  token: string | null;
  session: SessionResolveResponse | null;
  error: SessionError | null;
}

interface SessionContextValue extends SessionState {
  resolve: (token: string) => Promise<void>;
  /**
   * Patches `session.openOrder` in place, without a network round-trip. Used to
   * reflect an order just placed, or a status change seen while viewing it,
   * immediately — a full re-resolve only happens at re-entry.
   */
  setOpenOrder: (openOrder: SessionResolveResponse['openOrder']) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function classify(err: unknown): SessionError {
  if (err instanceof NetworkError) {
    return { kind: 'network' };
  }
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'STORE_CLOSED': {
        const opensAt =
          err.body && typeof err.body === 'object' && 'opensAt' in err.body
            ? String(err.body.opensAt)
            : null;
        return { kind: 'store_closed', opensAt };
      }
      case 'ORDERING_SUSPENDED':
        return { kind: 'ordering_suspended' };
      case 'SESSION_EXPIRED':
        return { kind: 'expired' };
      case 'SESSION_INVALID':
        return { kind: 'invalid' };
      case 'WHATSAPP_ORDERING_DISABLED':
        return { kind: 'disabled' };
      default:
        return { kind: 'unknown' };
    }
  }
  return { kind: 'unknown' };
}

export function SessionProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  /** Tests and the dev gallery seed a ready session directly. */
  initialState?: SessionState;
}): React.JSX.Element {
  const [state, setState] = useState<SessionState>(
    initialState ?? { status: 'idle', token: null, session: null, error: null },
  );
  const inFlight = useRef<string | null>(null);

  const resolve = useCallback(async (token: string) => {
    if (inFlight.current === token) {
      return;
    }
    inFlight.current = token;
    setAuthToken(token);
    setState((s) => ({ ...s, status: 'loading', token, error: null }));
    try {
      const session = await resolveSession(token);
      storeCustomerSessionToken(token);
      setState({ status: 'ready', token, session, error: null });
    } catch (err) {
      const error = classify(err);
      if (error.kind === 'expired' || error.kind === 'invalid' || error.kind === 'disabled') {
        clearStoredCustomerSessionToken();
        setAuthToken(null);
      }
      setState({ status: 'error', token, session: null, error });
    } finally {
      inFlight.current = null;
    }
  }, []);

  const setOpenOrder = useCallback((openOrder: SessionResolveResponse['openOrder']) => {
    setState((s) => (s.session ? { ...s, session: { ...s.session, openOrder } } : s));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, resolve, setOpenOrder }),
    [state, resolve, setOpenOrder],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return ctx;
}

/** Non-null session for screens rendered only when status === 'ready'. */
export function useReadySession(): SessionResolveResponse {
  const { session } = useSession();
  if (!session) {
    throw new Error('useReadySession used before the session resolved');
  }
  return session;
}
