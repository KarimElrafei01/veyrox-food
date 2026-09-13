import { Icon, useT } from '@veyroxai/ui';
import type { BoardMetrics } from '../usecases/boardState.js';
import styles from './MetricsStrip.module.css';

/** §1.1's metrics strip. Recall Bump reverses the single most recent bump on
 *  this station (§1.4) via the same POST /orders/:id/revert every ticket
 *  detail undo uses - disabled when there is nothing this session bumped
 *  (a reload loses that in-memory pointer by design, rather than guessing). */
export function MetricsStrip({
  metrics,
  lastBumpedOrderId,
  onRecallBump,
}: {
  metrics: BoardMetrics;
  lastBumpedOrderId: string | null;
  onRecallBump: () => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <section className={styles.strip}>
      <div className={styles.left}>
        <div className={styles.live}>
          <span className={styles.dot} aria-hidden />
          <span className={styles.liveText}>{t('kds.metrics.liveStreamActive')}</span>
        </div>
        <span className={styles.stat} dir="ltr">
          {t('kds.metrics.railCapacity', {
            used: metrics.railCapacity.used,
            slots: metrics.railCapacity.slots,
          })}
        </span>
        <span className={styles.stat} dir="ltr">
          {t('kds.metrics.peakVelocity', { count: metrics.peakVelocityPerHour })}
        </span>
      </div>
      <button
        type="button"
        className={styles.recallButton}
        disabled={!lastBumpedOrderId}
        onClick={onRecallBump}
      >
        <Icon name="undo" size={16} />
        {t('kds.metrics.recallBump')}
      </button>
    </section>
  );
}
