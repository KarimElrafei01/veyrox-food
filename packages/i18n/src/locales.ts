/**
 * English is the default; Arabic (Egypt) is offered (Q5, closed 2026-09-05).
 * Both text directions must be correct from the first screen (CLAUDE.md).
 */
export const LOCALES = ['en', 'ar-EG'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export type Direction = 'ltr' | 'rtl';

export function dir(locale: Locale): Direction {
  return locale === 'ar-EG' ? 'rtl' : 'ltr';
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
