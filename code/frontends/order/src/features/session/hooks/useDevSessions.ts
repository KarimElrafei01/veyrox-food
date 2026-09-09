import { useEffect, useState } from 'react';
import { loadDevSessions } from '../repo/devSessionsRepo.js';
import type { DevSessionCafe } from '../datasource/devSessionsDatasource.js';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'available'; cafes: DevSessionCafe[] };

/**
 * Probes `GET /dev/sessions` once, only when `enabled` (the no-token entry path).
 * `unavailable` is the normal production result — the endpoint 404s unless the API
 * runs with DEV_LOGIN=1, so real customers never see the dev picker.
 */
export function useDevSessions(enabled: boolean): State {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState({ status: 'loading' });
    void loadDevSessions().then((cafes) => {
      if (!live) return;
      setState(cafes ? { status: 'available', cafes } : { status: 'unavailable' });
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  return state;
}
