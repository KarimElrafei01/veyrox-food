import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, dir, type Locale, translate } from '@veyroxai/i18n';
import { applyDocumentDirection } from '@veyroxai/ui';
import { OverviewScreen } from '../features/overview/ui/OverviewScreen.js';

/**
 * Placeholder shell. Owner auth (argon2id + TOTP), the tab layout and the dataScope-gated
 * panels (FR-5.25) land in Sprint 6.
 */
export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    applyDocumentDirection(document, locale, dir(locale));
  }, [locale]);

  const next: Locale = locale === 'en' ? 'ar-EG' : 'en';

  return (
    <main>
      <OverviewScreen locale={locale} />
      <button type="button" onClick={() => setLocale(next)}>
        {translate(locale, 'common.language')}: {next}
      </button>
    </main>
  );
}
