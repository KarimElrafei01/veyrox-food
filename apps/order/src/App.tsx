import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, dir, type Locale, translate } from '@veyroxai/i18n';
import { applyDocumentDirection } from '@veyroxai/ui';

/**
 * Placeholder shell. Its only job today is to prove RTL is correct from the first
 * screen (CLAUDE.md — Non-negotiables): toggling the language flips `<html dir>`
 * and every logical layout property with it. No literal strings — all copy goes
 * through the catalog (NFR-43).
 */
export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    applyDocumentDirection(document, locale, dir(locale));
  }, [locale]);

  const next: Locale = locale === 'en' ? 'ar-EG' : 'en';

  return (
    <main style={{ padding: 'var(--vx-space-4)', maxInlineSize: '32rem', marginInline: 'auto' }}>
      <h1>{translate(locale, 'app.name')}</h1>
      <p>{translate(locale, 'order.title')}</p>
      <button type="button" onClick={() => setLocale(next)}>
        {translate(locale, 'common.language')}: {next}
      </button>
    </main>
  );
}
