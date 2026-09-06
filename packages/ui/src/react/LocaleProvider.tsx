import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  dir as dirOf,
  isLocale,
  type Direction,
  type Locale,
  type MessageKey,
  type TranslateParams,
  translate,
} from '@veyroxai/i18n';
import { applyDocumentDirection } from '../index.js';

const STORAGE_KEY = 'vx.locale';

interface LocaleContextValue {
  locale: Locale;
  dir: Direction;
  t: (key: MessageKey, params?: TranslateParams) => string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStored(): Locale | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

interface LocaleProviderProps {
  /** Session default (F1.1). Overridden by a stored per-viewer choice. */
  initialLocale?: Locale;
  supportedLocales?: readonly Locale[];
  children: React.ReactNode;
}

export function LocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  supportedLocales = ['en', 'ar-EG'],
  children,
}: LocaleProviderProps): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(() => readStored() ?? initialLocale);

  useEffect(() => {
    applyDocumentDirection(document, locale, dirOf(locale));
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* private mode — the in-memory choice still applies */
    }
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (supportedLocales.includes(next)) {
        setLocaleState(next);
      }
    },
    [supportedLocales],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: dirOf(locale),
      t: (key, params) => translate(locale, key, params),
      setLocale,
      toggleLocale: () => setLocale(locale === 'en' ? 'ar-EG' : 'en'),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useT must be used inside <LocaleProvider>');
  }
  return ctx;
}
