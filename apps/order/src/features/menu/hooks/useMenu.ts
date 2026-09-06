import { useCallback, useEffect, useRef, useState } from 'react';
import type { MenuResponse } from '@veyroxai/contracts';
import { fetchAvailability, fetchMenu } from '../repo/menuRepo.js';
import { mergeMenu, type ResolvedMenu } from '../usecases/loadMenu.js';

type State =
  | { status: 'loading'; menu: null }
  | { status: 'ready'; menu: ResolvedMenu }
  | { status: 'error'; menu: null };

/**
 * Loads the immutable menu once, then re-fetches **availability only** on window
 * focus (F1.2 §1 — never the whole menu again, never on a timer).
 */
export function useMenu(menuVersion: string): State & { refreshAvailability: () => void } {
  const [state, setState] = useState<State>({ status: 'loading', menu: null });
  const rawMenu = useRef<MenuResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    rawMenu.current = null;
    setState({ status: 'loading', menu: null });
    Promise.all([fetchMenu(menuVersion), fetchAvailability().catch(() => null)])
      .then(([menu, availability]) => {
        if (cancelled) {
          return;
        }
        rawMenu.current = menu;
        setState({ status: 'ready', menu: mergeMenu(menu, availability) });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', menu: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [menuVersion]);

  const refreshAvailability = useCallback(() => {
    const menu = rawMenu.current;
    if (!menu) {
      return;
    }
    fetchAvailability()
      .then((availability) => setState({ status: 'ready', menu: mergeMenu(menu, availability) }))
      .catch(() => {
        /* keep the last good board; stale availability is acceptable briefly */
      });
  }, []);

  useEffect(() => {
    window.addEventListener('focus', refreshAvailability);
    return () => window.removeEventListener('focus', refreshAvailability);
  }, [refreshAvailability]);

  return { ...state, refreshAvailability };
}
