import type { MessageKey, TranslateParams } from '@veyroxai/i18n';
import { useT } from './LocaleProvider.js';

/** Renders a catalog string. Keeps literal text out of components (NFR-43). */
export function T({ k, params }: { k: MessageKey; params?: TranslateParams }): React.JSX.Element {
  const { t } = useT();
  return <>{t(k, params)}</>;
}
