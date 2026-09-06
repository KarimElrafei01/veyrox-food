import { describe, expect, it } from 'vitest';
import { dir, isLocale } from './locales.js';
import { translate } from './catalog.js';

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
    expect(translate('en', 'order.title')).toBe('Order');
    expect(translate('ar-EG', 'order.title')).toBe('الطلب');
  });
});
