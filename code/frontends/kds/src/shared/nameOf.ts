import type { Locale } from '@veyroxai/i18n';

/** Every item/modifier name arrives as a frozen `{ en, 'ar-EG'? }` snapshot
 *  (order_items freezes names at placement, NFR-19) - this picks the display
 *  string for the current locale, falling back to English exactly like
 *  translate() does for a missing catalog key. Lives in `shared/` (not
 *  `features/board/`) because both the board and accept-gate features need
 *  it and ADR-0018 forbids one feature importing another's components. */
export function nameOf(snapshot: { en: string; 'ar-EG'?: string }, locale: Locale): string {
  return locale === 'ar-EG' ? (snapshot['ar-EG'] ?? snapshot.en) : snapshot.en;
}
