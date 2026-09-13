import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  bootstrapStaffSessionFromUrl,
  clearStoredStaffSession,
  readStoredStaffSession,
  type StaffSession,
} from '@veyroxai/ops-core';
import { setStaffTokens } from './api.js';

interface StaffSessionContextValue {
  session: StaffSession | null;
  /** Called when an API response 401s with SESSION_INVALID/SESSION_EXPIRED -
   *  clears the stored session so the app falls back to the "no session"
   *  screen rather than looping failed requests against a dead token. */
  clear: () => void;
}

const StaffSessionContext = createContext<StaffSessionContextValue | null>(null);

export function StaffSessionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [session, setSession] = useState<StaffSession | null>(null);

  useEffect(() => {
    bootstrapStaffSessionFromUrl(window.location);
    setSession(readStoredStaffSession());
  }, []);

  // Layout, not passive: on the render where `session` first turns non-null,
  // the board mounts in the same commit and fires its own (passive) effect to
  // fetch the snapshot. React guarantees every layout effect in the tree runs
  // before any passive effect, so this is what stops that fetch from reading
  // shared/api.ts's module state before it's set - a passive effect here
  // raced it and 401'd on the very first load (session state was set, but the
  // sibling's own effect landed first).
  useLayoutEffect(() => {
    setStaffTokens(session);
  }, [session]);

  const value = useMemo<StaffSessionContextValue>(
    () => ({
      session,
      clear: () => {
        clearStoredStaffSession();
        setSession(null);
      },
    }),
    [session],
  );

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionContextValue {
  const ctx = useContext(StaffSessionContext);
  if (!ctx) {
    throw new Error('useStaffSession must be used inside <StaffSessionProvider>');
  }
  return ctx;
}
