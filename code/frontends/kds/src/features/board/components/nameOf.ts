import type { Locale } from '@veyroxai/i18n';

/** Every item/modifier name arrives as a frozen `{ en, 'ar-EG'? }` snapshot
 *  (order_items freezes names at placement, NFR-19) - this picks the display
 *  string for the current locale, falling back to English exactly like
 *  translate() does for a missing catalog key. */
export function nameOf(snapshot: { en: string; 'ar-EG'?: string }, locale: Locale): string {
  return locale === 'ar-EG' ? (snapshot['ar-EG'] ?? snapshot.en) : snapshot.en;
}
