import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, dir, type Locale, translate } from '@veyroxai/i18n';
import { applyDocumentDirection } from '@veyroxai/ui';

/**
 * Placeholder shell. The four-column board (New / Received / Preparing / Ready),
 * the accept gate, and the SSE client from `@veyroxai/ops-core` land in Sprint 3.
 * For now this proves the shared shell and RTL work here too.
 */
export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    applyDocumentDirection(document, locale, dir(locale));
  }, [locale]);

  const next: Locale = locale === 'en' ? 'ar-EG' : 'en';

  return (
    <main style={{ padding: 'var(--vx-space-4)' }}>
      <h1>{translate(locale, 'kds.title')}</h1>
      <button type="button" onClick={() => setLocale(next)}>
        {translate(locale, 'common.language')}: {next}
      </button>
    </main>
  );
}
