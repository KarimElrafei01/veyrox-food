import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, dir, type Locale, translate } from '@veyroxai/i18n';
import { applyDocumentDirection } from '@veyroxai/ui';
import { FleetScreen } from '../features/fleet/ui/FleetScreen.js';

/**
 * Placeholder shell. Platform Admin is a separate deployable and auth realm — mandatory
 * WebAuthn hardware key, no password fallback (ADR-0014). The realm lands in Sprint 6–7.
 */
export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    applyDocumentDirection(document, locale, dir(locale));
  }, [locale]);

  const next: Locale = locale === 'en' ? 'ar-EG' : 'en';

  return (
    <main>
      <FleetScreen locale={locale} />
      <button type="button" onClick={() => setLocale(next)}>
        {translate(locale, 'common.language')}: {next}
      </button>
    </main>
  );
}
