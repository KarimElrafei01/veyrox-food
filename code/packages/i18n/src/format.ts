import type { Locale } from './locales.js';

/**
 * Money is integer minor units — piastres (ADR-0007). Rendered here, once, at the
 * display boundary. Western Arabic numerals (0–9) even in ar-EG, per the Stitch
 * foundation brief: prices and counts stay legible to every reader.
 */
const NUMERIC_LOCALE: Record<Locale, string> = {
  en: 'en-EG',
  'ar-EG': 'ar-EG-u-nu-latn',
};

interface MoneyOptions {
  currency?: string;
  /** Drop `.00` on a whole-pound amount. */
  compact?: boolean;
}

export function formatMoney(minor: number, locale: Locale, options: MoneyOptions = {}): string {
  const { currency = 'EGP', compact = false } = options;
  const pounds = minor / 100;
  const whole = Number.isInteger(pounds);
  const digits = compact && whole ? 0 : 2;
  const amount = new Intl.NumberFormat(NUMERIC_LOCALE[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(pounds);
  // Symbol placement is handled by our own catalog string, not Intl currency
  // formatting, so "EGP" / "ج.م" stays consistent with the rest of the UI.
  return locale === 'ar-EG' ? `${amount} ${currency}` : `${currency} ${amount}`;
}

export function formatMinutesRange(lower: number, upper: number, locale: Locale): string {
  const nf = new Intl.NumberFormat(NUMERIC_LOCALE[locale], { maximumFractionDigits: 0 });
  return `${nf.format(lower)}–${nf.format(upper)} ${locale === 'ar-EG' ? 'دقيقة' : 'min'}`;
}

export function formatClock(iso: string, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(NUMERIC_LOCALE[locale], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/** ms → `HH:MM:SS`, floored at zero. For the "opens in" countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** ms → `MM:SS`, floored at zero, minutes uncapped past 99 (a KDS ticket timer
 *  running that long is itself the alarm). Every KDS elapsed/remaining timer
 *  uses this, never formatCountdown's HH:MM:SS - the design's monospaced
 *  timers are two two-digit groups, per DESIGN.md's timer-display type scale. */
export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(m)}:${pad(s)}`;
}
