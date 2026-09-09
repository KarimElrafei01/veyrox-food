import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, dir, type Locale, translate } from '@veyroxai/i18n';
import { applyDocumentDirection } from '@veyroxai/ui';
import { OrdersScreen } from '../features/orders/ui/OrdersScreen.js';

/**
 * Placeholder shell. Device enrollment, staff PIN, the SSE client and the offline outbox
 * come from `@veyroxai/ops-core` in Sprint 3 — shared with KDS, never duplicated here.
 */
export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    applyDocumentDirection(document, locale, dir(locale));
  }, [locale]);

  const next: Locale = locale === 'en' ? 'ar-EG' : 'en';

  return (
    <main>
      <OrdersScreen locale={locale} />
      <button type="button" onClick={() => setLocale(next)}>
        {translate(locale, 'common.language')}: {next}
      </button>
    </main>
  );
}
