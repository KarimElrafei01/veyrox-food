import { Icon, useT } from '@veyroxai/ui';
import { formatMmSs } from '@veyroxai/i18n';
import type { OrderTicket } from '@veyroxai/contracts';
import styles from './AcceptGateHeader.module.css';

export function AcceptGateHeader({
  ticket,
  elapsedSeconds,
  onClose,
}: {
  ticket: OrderTicket;
  elapsedSeconds: number;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <span className={styles.channelBadge} aria-hidden>
          <Icon name={ticket.channel === 'whatsapp' ? 'chat' : 'storefront'} size={26} />
        </span>
        <div className={styles.titles}>
          <div className={styles.channelRow}>
            <span className={styles.channelChip}>
              {ticket.channel === 'whatsapp' ? t('kds.ticket.whatsapp') : t('kds.ticket.till')}
            </span>
            <span className={styles.fulfillmentLabel}>
              {ticket.tableLabel ?? t('kds.ticket.pickup')}
            </span>
          </div>
          <span className={styles.orderName}>
            {ticket.orderNumber} · {ticket.customerFirstName ?? ''}
          </span>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.timerCapsule}>
          <span className={styles.timerLabel}>{t('kds.acceptGate.waitingTimeLabel')}</span>
          <div className={styles.timerRow}>
            <span className={styles.pulseDot} aria-hidden />
            <span className={styles.timerValue} dir="ltr">
              {formatMmSs(elapsedSeconds * 1000)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label={t('kds.acceptGate.close')}
          onClick={onClose}
        >
          <Icon name="close" size={24} />
        </button>
      </div>
    </div>
  );
}
