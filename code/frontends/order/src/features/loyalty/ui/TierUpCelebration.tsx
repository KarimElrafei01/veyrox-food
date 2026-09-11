import { Button, Icon, useT } from '@veyroxai/ui';
import type { LoyaltyTier } from '@veyroxai/contracts';
import styles from './TierUpCelebration.module.css';

export interface TierUpCelebrationData {
  customerName: string;
  tier: LoyaltyTier;
  balance: number;
  pointsEarned: number;
  nextTierPoints: number | null;
}

const tierMultiplier: Record<LoyaltyTier, string> = {
  bronze: '1.0×',
  silver: '1.2×',
  gold: '1.5×',
};

/**
 * Shown once when collection crosses a loyalty boundary. Its motion deliberately
 * layers after the scrim so the promotion reads as a reward, not an interruption.
 */
export function TierUpCelebration({
  data,
  onDismiss,
}: {
  data: TierUpCelebrationData;
  onDismiss: () => void;
}): React.JSX.Element {
  const { t } = useT();
  const tierName = t(`loyalty.tier.${data.tier}`);
  const nextTier = data.nextTierPoints == null ? null : t('loyalty.tier.gold');
  const perks = [
    {
      icon: 'bolt' as const,
      tone: 'espresso',
      title: t('loyalty.multiplierPerk', { multiplier: tierMultiplier[data.tier] }),
      note: t('loyalty.multiplierPerkBody'),
      trailing: t('loyalty.active'),
    },
    {
      icon: 'local-cafe' as const,
      tone: 'terracotta',
      title: t('loyalty.altMilkPerk'),
      note: t('loyalty.altMilkPerkBody'),
      trailing: t('loyalty.altMilkSaving'),
    },
    ...(data.tier === 'gold'
      ? [
          {
            icon: 'schedule' as const,
            tone: 'neutral',
            title: t('loyalty.priorityPerk'),
            note: t('loyalty.priorityPerkBody'),
            trailing: t('loyalty.rushHours'),
          },
        ]
      : []),
  ];
  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('loyalty.promotion')}
    >
      <div className={styles.underlay} aria-hidden="true">
        <div className={styles.underlaySummary}>
          <span>{t('loyalty.mockOrderNumber')}</span>
          <strong>{t('loyalty.mockOrderTitle')}</strong>
          <span>{t('loyalty.mockOrderMeta')}</span>
        </div>
        <div className={styles.underlayItem}>
          <div className={styles.mockPhoto} />
          <div>
            <strong>{t('loyalty.mockItemTitle')}</strong>
            <span>{t('loyalty.mockItemMeta')}</span>
          </div>
        </div>
      </div>
      <div className={styles.scrim} />
      <section className={styles.sheet}>
        <div className={styles.glowStart} aria-hidden="true" />
        <div className={styles.glowEnd} aria-hidden="true" />
        <div className={styles.confetti} aria-hidden="true">
          <Icon name="star" size={20} />
          <Icon name="star" size={12} />
          <Icon name="star" size={18} />
        </div>
        <div className={styles.medal} aria-hidden="true">
          <div>
            <div>
              <Icon name="loyalty" size={32} />
            </div>
          </div>
          <span>
            <Icon name="bolt" size={16} />
          </span>
        </div>
        <div className={styles.promotion}>
          <span>{t('loyalty.promotion')}</span>
          <i>·</i>
          <b lang="ar-EG">{t('loyalty.newSilverTier')}</b>
        </div>
        <h2>{t('loyalty.congratulations', { name: data.customerName })}</h2>
        <p className={styles.intro}>{t('loyalty.tierReachedBody', { tier: tierName })}</p>
        <div className={styles.balance}>
          <div className={styles.balanceLabel}>
            <span>
              <Icon name="loyalty" size={20} />
            </span>
            <p>
              {t('loyalty.earnedBalance')}
              <strong>{t('loyalty.baladiPoints', { points: data.balance })}</strong>
            </p>
          </div>
          <p className={styles.balanceNext}>
            <strong>{t('loyalty.pointsToday', { points: data.pointsEarned })}</strong>
            {nextTier ? (
              <span>{t('loyalty.nextTier', { tier: nextTier, points: data.nextTierPoints! })}</span>
            ) : null}
          </p>
        </div>
        <p className={styles.perksLabel}>{t('loyalty.freshPerks')}</p>
        <div className={styles.perks}>
          {perks.map((perk) => (
            <div className={styles.perk} key={perk.title}>
              <span className={styles[perk.tone]}>
                <Icon name={perk.icon} size={18} />
              </span>
              <div>
                <p>
                  <strong>{perk.title}</strong>
                  <em>{perk.trailing}</em>
                </p>
                <small>{perk.note}</small>
              </div>
            </div>
          ))}
        </div>
        <Button variant="primary" size="lg" fullWidth iconEnd="local-cafe" onClick={onDismiss}>
          {t('loyalty.niceLetsBrew')}
        </Button>
        <button type="button" className={styles.secondaryAction} onClick={onDismiss}>
          {t('loyalty.exploreHub')}
        </button>
      </section>
      <p className={styles.footer} aria-hidden="true">
        {t('loyalty.cairoLove')} <span>·</span> <b lang="ar-EG">{t('loyalty.cairoArabic')}</b>
      </p>
    </div>
  );
}
