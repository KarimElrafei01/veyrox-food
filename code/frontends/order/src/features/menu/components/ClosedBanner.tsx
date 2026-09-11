import { Icon, StatusDot, useT } from '@veyroxai/ui';
import { CountdownClock } from '../../../shared/ui/CountdownClock.js';
import styles from './ClosedBanner.module.css';

/** Persistent while browsing a closed café (F1.1 browse-only mode) — the menu
 *  itself stays visible, but this banner never scrolls out of the way. */
export function ClosedBanner({
  storeName,
  opensAt,
}: {
  storeName: string;
  opensAt: string | null;
}): React.JSX.Element {
  const { t } = useT();
  const deadlineMs = opensAt ? new Date(opensAt).getTime() : null;

  return (
    <div className={styles.banner}>
      <div className={styles.head}>
        <StatusDot pulse />
        <span className={styles.title}>{t('menu.closedBannerTitle', { store: storeName })}</span>
      </div>
      {deadlineMs ? (
        <div className={styles.countdownRow}>
          <span className={styles.countdownLabel}>
            <Icon name="wb-twilight" size={14} />
            {t('store.closedBannerBody')}
          </span>
          <CountdownClock deadlineMs={deadlineMs} />
        </div>
      ) : null}
      <p className={styles.hint}>{t('store.addBlocked')}</p>
    </div>
  );
}
