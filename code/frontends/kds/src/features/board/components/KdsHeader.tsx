import { Icon, useT } from '@veyroxai/ui';
import styles from './KdsHeader.module.css';

/** The persistent app shell header (§1.1), shared across every screen -
 *  lives here because the board is the KDS's home screen and every other
 *  screen is an overlay on top of it. Recall Log / Expo Summary / Settings /
 *  avatar are out of scope for this pass (no backend for any of them) -
 *  rendered as visibly inert rather than omitted, so the layout matches the
 *  design and a future pass has an obvious slot to wire. */
export function KdsHeader({
  connected,
  lastUpdateSeconds,
  activeStations,
  onChangeStations,
  unavailableItemCount,
}: {
  connected: boolean;
  lastUpdateSeconds: number | null;
  activeStations: number;
  onChangeStations: (next: number) => void;
  unavailableItemCount: number;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {/* Stitch source ships a googleusercontent.com AIDA-generated logo
         *  image here (kds_chef_station_logo/) - a placeholder, not a real
         *  asset (frontend doc §0.3). Text lockup until a real mark exists. */}
        <span className={styles.wordmark} aria-hidden>
          {t('kds.header.wordmark')}
        </span>
        <div className={styles.titles}>
          <span className={styles.lineLabel}>{t('kds.header.hotLine')}</span>
          <div className={styles.status}>
            <span
              className={[styles.dot, connected ? '' : styles.disconnected]
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            />
            <span className={styles.statusText} dir="ltr">
              {connected
                ? lastUpdateSeconds !== null && lastUpdateSeconds > 0
                  ? t('kds.header.connected', { seconds: lastUpdateSeconds })
                  : t('kds.header.connectedNow')
                : t('kds.header.disconnected')}
            </span>
          </div>
        </div>
        <nav className={styles.nav}>
          <button type="button" className={[styles.navLink, styles.active].join(' ')}>
            {t('kds.header.liveOrders')}
          </button>
          <button type="button" className={styles.navLink} disabled>
            {t('kds.header.recallLog')}
          </button>
          <button type="button" className={styles.navLink} disabled>
            {t('kds.header.expoSummary')}
          </button>
        </nav>
      </div>

      <div className={styles.right}>
        <div className={styles.stations}>
          <span className={styles.stationsLabel}>{t('kds.header.stations')}</span>
          <button
            type="button"
            className={styles.stepButton}
            aria-label={t('kds.header.decreaseStations')}
            disabled={activeStations <= 1}
            onClick={() => onChangeStations(activeStations - 1)}
          >
            −
          </button>
          <span className={styles.stationsCount} dir="ltr">
            {activeStations}
          </span>
          <button
            type="button"
            className={styles.stepButton}
            aria-label={t('kds.header.increaseStations')}
            disabled={activeStations >= 12}
            onClick={() => onChangeStations(activeStations + 1)}
          >
            +
          </button>
        </div>
        <button type="button" className={styles.pillButton} disabled>
          {t('kds.header.86Items')}
          {unavailableItemCount > 0 && <span className={styles.badge}>{unavailableItemCount}</span>}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('kds.header.settings')}
          disabled
        >
          <Icon name="tune" size={22} />
        </button>
        <span className={styles.avatar} aria-hidden>
          <Icon name="person" size={18} />
        </span>
      </div>
    </header>
  );
}
