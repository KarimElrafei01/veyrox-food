import { type Locale, translate } from '@veyroxai/i18n';

/**
 * Placeholder. The open-orders list and cash/visa recording (FR-4, ADR-0010) land in
 * Sprint 3, offline-first via `@veyroxai/ops-core`. Real screens live here; feature-local
 * pieces go in `../components`, data in `../datasource` / `../repo`, glue in `../hooks`.
 */
export function OrdersScreen({ locale }: { locale: Locale }): React.JSX.Element {
  return (
    <section style={{ padding: 'var(--vx-space-4)' }}>
      <h1>{translate(locale, 'till.title')}</h1>
      <p>{translate(locale, 'common.loading')}</p>
    </section>
  );
}
