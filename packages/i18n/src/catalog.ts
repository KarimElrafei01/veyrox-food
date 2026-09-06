import { DEFAULT_LOCALE, type Locale } from './locales.js';
import { en, type MessageKey } from './catalogs/en.js';
import { arEG } from './catalogs/ar-EG.js';

export type { MessageKey };

export const catalogs: Record<Locale, Partial<Record<MessageKey, string>>> = {
  en,
  'ar-EG': arEG,
};

export type TranslateParams = Record<string, string | number>;

/**
 * Resolve a message. Missing `ar-EG` keys fall back to English (FR-9.1).
 * `{name}` placeholders are replaced from `params`; an unknown placeholder is
 * left as-is so it is visible in review rather than silently dropped.
 */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const template = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
