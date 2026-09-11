import type { Locale } from '@veyroxai/i18n';

const NUMERIC_LOCALE: Record<Locale, string> = { en: 'en-US', 'ar-EG': 'ar-EG' };

/** "08:00" -> "8:00 AM" (or the Arabic-Indic equivalent) — the weekly-schedule rows
 *  carry plain `HH:MM` strings, not timestamps, so there's no timezone to apply. */
export function formatHourString(value: string, locale: Locale): string {
  const [hour, minute] = value.split(':').map(Number);
  const asDate = new Date(Date.UTC(2000, 0, 1, hour ?? 0, minute ?? 0));
  return new Intl.DateTimeFormat(NUMERIC_LOCALE[locale], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(asDate);
}

export function formatHoursRange(
  range: { opens: string; closes: string } | null,
  locale: Locale,
): string | null {
  if (!range) return null;
  return `${formatHourString(range.opens, locale)} – ${formatHourString(range.closes, locale)}`;
}
