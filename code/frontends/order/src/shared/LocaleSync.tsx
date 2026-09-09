import { useEffect, useRef } from 'react';
import { useT } from '@veyroxai/ui';
import { isLocale } from '@veyroxai/i18n';
import { updateLocalePreference } from '../features/session/repo/sessionRepo.js';

/**
 * Bridges the session locale (F1.1 §3) and FR-2.4:
 *  - on first ready, adopt `session.session.locale` unless this viewer already
 *    chose one (stored by `LocaleProvider`);
 *  - whenever the viewer toggles, persist it to `customers.locale` server-side.
 * Renders nothing.
 */
export function LocaleSync({ sessionLocale }: { sessionLocale: string }): null {
  const { locale, setLocale } = useT();
  const adopted = useRef(false);
  const firstChange = useRef(true);
  const sequence = useRef(0);

  useEffect(() => {
    if (adopted.current) {
      return;
    }
    adopted.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('vx.locale');
    } catch {
      /* private mode */
    }
    if (!stored && isLocale(sessionLocale) && sessionLocale !== locale) {
      setLocale(sessionLocale);
    }
    try {
      sequence.current =
        Number.parseInt(localStorage.getItem('vx.locale.sequence') ?? '0', 10) || 0;
    } catch {
      /* private mode */
    }
  }, [sessionLocale, locale, setLocale]);

  useEffect(() => {
    if (firstChange.current) {
      firstChange.current = false;
      return;
    }
    const nextSequence = sequence.current + 1;
    sequence.current = nextSequence;
    try {
      localStorage.setItem('vx.locale.sequence', String(nextSequence));
    } catch {
      /* private mode */
    }
    void updateLocalePreference(locale, nextSequence).then((persistedSequence) => {
      sequence.current = Math.max(sequence.current, persistedSequence);
    });
  }, [locale]);

  return null;
}
