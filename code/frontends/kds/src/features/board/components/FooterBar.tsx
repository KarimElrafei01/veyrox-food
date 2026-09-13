import { Icon, useT } from '@veyroxai/ui';
import { formatMmSs } from '@veyroxai/i18n';
import type { BoardMetrics } from '../usecases/boardState.js';
import styles from './FooterBar.module.css';

/** §1.1's persistent footer. Lock Screen / Batch Print have no backend in
 *  this feature at all (not named anywhere in the F2 backend doc) - rendered
 *  inert rather than omitted, same reasoning as the header's stubbed nav. */
export function FooterBar({ metrics }: { metrics: BoardMetrics }): React.JSX.Element {
  const { t } = useT();
  return (
    <footer className={styles.footer}>
      <div className={styles.left}>
        {/* Design names per-station status here ("Grill 1 · Saute 2 · Fryers
         *  Dual Active") - no backend field carries individual station names,
         *  only a headcount (activeStations), so that line is omitted rather
         *  than invented (same §0.3 rule as the metrics strip's line-pace
         *  pill: an operational-looking label with no real data behind it). */}
        <div className={styles.lineInfo}>
          <span className={styles.lineIcon} aria-hidden>
            <Icon name="kitchen" size={22} />
          </span>
          <span className={styles.lineLabel}>{t('kds.footer.lineLabel')}</span>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t('kds.footer.activeTickets')}</span>
            <span className={styles.statValue} dir="ltr">
              {metrics.activeTicketCount}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t('kds.footer.delayed')}</span>
            <span
              className={[styles.statValue, metrics.delayedOver15mCount > 0 ? styles.delayed : '']
                .filter(Boolean)
                .join(' ')}
              dir="ltr"
            >
              {metrics.delayedOver15mCount}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>{t('kds.footer.avgTurnaround')}</span>
            <span className={styles.statValue} dir="ltr">
              {formatMmSs(metrics.avgTurnaroundSeconds * 1000)}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled>
          <Icon name="lock" size={18} />
          {t('kds.footer.lockScreen')}
        </button>
        <button type="button" className={styles.button} disabled>
          <Icon name="receipt-long" size={18} />
          {t('kds.footer.batchPrint')}
        </button>
      </div>
    </footer>
  );
}
