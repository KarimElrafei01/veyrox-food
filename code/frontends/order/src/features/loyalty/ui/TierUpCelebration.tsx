import { Button, Icon, useT } from '@veyroxai/ui';
import { translate, type Locale, type MessageKey } from '@veyroxai/i18n';
import type { LoyaltyTier } from '@veyroxai/contracts';
import styles from './TierUpCelebration.module.css';

/**
 * Shown once when a customer crosses a tier boundary (FR-2.21). The crossing is
 * detected server-side at collection (F1.5 §4); the webview only renders it if it
 * happens to be open. Presentational — parent controls visibility and dismissal.
 */
export function TierUpCelebration({
  locale,
  tier,
  onDismiss,
}: {
  locale: Locale;
  tier: LoyaltyTier;
  onDismiss: () => void;
}): React.JSX.Element {
  const { t } = useT();
  const perkKey: MessageKey =
    tier === 'gold' ? 'loyalty.perk.priorityPrep' : 'loyalty.perk.freeAltMilk';
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <span className={styles.badge}>
          <Icon name="loyalty" size={32} />
        </span>
        <h2 className={styles.title}>
          {translate(locale, 'loyalty.tierUpTitle', {
            tier: translate(locale, `loyalty.tier.${tier}` as MessageKey),
          })}
        </h2>
        <p className={styles.body}>
          {translate(locale, 'loyalty.tierUpBody', { perk: translate(locale, perkKey) })}
        </p>
        <Button variant="primary" size="lg" fullWidth onClick={onDismiss}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
