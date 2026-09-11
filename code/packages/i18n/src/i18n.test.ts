import { describe, expect, it } from 'vitest';
import { dir, isLocale } from './locales.js';
import { translate } from './catalog.js';
import { formatCountdown, formatMinutesRange, formatMoney } from './format.js';

describe('direction', () => {
  it('is rtl for Arabic and ltr for English', () => {
    expect(dir('ar-EG')).toBe('rtl');
    expect(dir('en')).toBe('ltr');
  });
});

describe('isLocale', () => {
  it('accepts known locales only', () => {
    expect(isLocale('ar-EG')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});

describe('translate', () => {
  it('returns the localized string', () => {
    expect(translate('en', 'cart.title')).toBe('Your cart');
    expect(translate('ar-EG', 'cart.title')).toBe('سلتك');
  });

  it('interpolates params', () => {
    expect(translate('en', 'common.items', { count: 3 })).toBe('3 items');
    expect(translate('en', 'openOrder.view', { number: 'A-041' })).toBe(
      'View Active Order (A-041)',
    );
  });

  it('falls back to English for a missing ar-EG key', () => {
    expect(translate('ar-EG', 'entry.browseMenu').length).toBeGreaterThan(0);
  });
});

describe('formatMoney', () => {
  it('places the currency per locale with Western digits', () => {
    expect(formatMoney(6500, 'en')).toBe('EGP 65.00');
    expect(formatMoney(6500, 'ar-EG')).toBe('65.00 EGP');
  });

  it('compact drops .00 on whole pounds only', () => {
    expect(formatMoney(7000, 'en', { compact: true })).toBe('EGP 70');
    expect(formatMoney(7050, 'en', { compact: true })).toBe('EGP 70.50');
  });

  it('handles zero', () => {
    expect(formatMoney(0, 'en', { compact: true })).toBe('EGP 0');
  });
});

describe('formatMinutesRange / formatCountdown', () => {
  it('renders a minutes range', () => {
    expect(formatMinutesRange(8, 12, 'en')).toBe('8–12 min');
  });

  it('floors the countdown at zero', () => {
    expect(formatCountdown(-5000)).toBe('00:00:00');
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
  });
});
