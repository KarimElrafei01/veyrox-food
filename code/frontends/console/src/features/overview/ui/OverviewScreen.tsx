import { type Locale, translate } from '@veyroxai/i18n';

/**
 * Placeholder. Owner analytics, costing and the margin panels (FR-5) land in Sprint 6.
 * The console refuses to render a margin until the pilot café has entered real costs
 * (FR-5.14) — that guard lives in `../usecases` when built.
 */
export function OverviewScreen({ locale }: { locale: Locale }): React.JSX.Element {
  return (
    <section style={{ padding: 'var(--vx-space-4)' }}>
      <h1>{translate(locale, 'console.title')}</h1>
      <p>{translate(locale, 'common.loading')}</p>
    </section>
  );
}
