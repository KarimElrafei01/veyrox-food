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
    // Customer-facing order status (F1.7 §3). `received` and `preparing` collapse
    // to one label on purpose — the split is a KDS column, not the customer's concern.
    'order.status.placed': 'Sent to the kitchen',
    'order.status.received': 'Being prepared',
    'order.status.preparing': 'Being prepared',
    'order.status.ready': 'Ready for collection',
    'order.status.collected': 'Collected',
    'order.status.rejected': 'Could not be prepared',
    'order.status.voided': 'Cancelled',
    'order.status.abandoned': 'Not collected',
  },
  'ar-EG': {
    'app.name': 'فيروكس فود',
    'common.language': 'اللغة',
    'common.loading': 'جارٍ التحميل…',
    'order.title': 'الطلب',
    'kds.title': 'المطبخ',
    'order.status.placed': 'تم الإرسال للمطبخ',
    'order.status.received': 'جاري التحضير',
    'order.status.preparing': 'جاري التحضير',
    'order.status.ready': 'جاهز للاستلام',
    'order.status.collected': 'تم الاستلام',
    'order.status.rejected': 'تعذّر التحضير',
    'order.status.voided': 'أُلغي',
    'order.status.abandoned': 'لم يُستلم',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof catalogs)['en'];

export function translate(locale: Locale, key: MessageKey): string {
  return catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key];
}
