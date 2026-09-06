import { DEFAULT_LOCALE, type Locale } from './locales.js';

/**
 * Message catalogs. Keys are the contract; a rendered component never contains a
 * literal string (NFR-43, enforced by lint once the SPAs have real screens).
 *
 * `ar-EG` copy is placeholder-quality and gets a pass from an Egyptian-Arabic
 * copywriter before M1 (docs/00-master-plan.md §9). Missing keys fall back to `en`.
 */
export const catalogs = {
  en: {
    'app.name': 'Veyrox Food',
    'common.language': 'Language',
    'common.loading': 'Loading…',
    'order.title': 'Order',
    'kds.title': 'Kitchen',
  },
  'ar-EG': {
    'app.name': 'فيروكس فود',
    'common.language': 'اللغة',
    'common.loading': 'جارٍ التحميل…',
    'order.title': 'الطلب',
    'kds.title': 'المطبخ',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof catalogs)['en'];

export function translate(locale: Locale, key: MessageKey): string {
  return catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key];
}
