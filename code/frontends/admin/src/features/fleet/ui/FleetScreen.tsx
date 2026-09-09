import { type Locale, translate } from '@veyroxai/i18n';

/**
 * Placeholder. Fleet operations — tenants, entitlements, flags, billing, support tooling
 * (FR-11) — land in Sprint 6–7. Every mutating action needs a reason, an audit row and a
 * CLI equivalent (ADR-0014); that is enforced in `../usecases` when built.
 */
export function FleetScreen({ locale }: { locale: Locale }): React.JSX.Element {
  return (
    <section style={{ padding: 'var(--vx-space-4)' }}>
      <h1>{translate(locale, 'admin.title')}</h1>
      <p>{translate(locale, 'common.loading')}</p>
    </section>
  );
}
