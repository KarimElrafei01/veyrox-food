import { Icon, useT } from '@veyroxai/ui';
import { formatClock } from '@veyroxai/i18n';
import type { OrderTicket } from '@veyroxai/contracts';
import { useAcceptGate } from '../hooks/useAcceptGate.js';
import { AcceptGateHeader } from '../components/AcceptGateHeader.js';
import { AcceptGateItemCard } from '../components/AcceptGateItemCard.js';
import { RejectReasonPanel } from '../components/RejectReasonPanel.js';
import styles from './AcceptGateModal.module.css';

/** Screen 3.2 (§2) - the kitchen-accept gate (ADR-0010). Full-screen overlay
 *  on the dimmed board, opened by orderId from `src/app/App.tsx`: the app
 *  shell, not the board feature, resolves `ticket` from the one shared
 *  `useBoard()` state and passes it in here as a plain read-only prop, since
 *  ADR-0018 forbids this feature importing anything from `features/board`.
 *  Accept/Reject fire their own mutation (this feature's own repo/
 *  datasource) and then just close - the board's own SSE subscription picks
 *  up the resulting `order.transitioned` event on its own, the same way a
 *  newly placed order already appears without this screen touching board
 *  state directly. */
export function AcceptGateModal({
  ticket,
  now,
  onClose,
}: {
  ticket: OrderTicket;
  now: Date;
  onClose: () => void;
}): React.JSX.Element {
  const { t, locale } = useT();
  const { phase, error, reasonPanelOpen, toggleReasonPanel, accept, reject } = useAcceptGate(
    ticket.orderId,
    onClose,
  );
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(ticket.placedAt).getTime()) / 1000),
  );
  const busy = phase === 'accepting' || phase === 'accepted' || phase === 'rejecting';

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={t('kds.acceptGate.title')}
      >
        <div className={styles.pulseBar} aria-hidden />
        <AcceptGateHeader ticket={ticket} elapsedSeconds={elapsedSeconds} onClose={onClose} />
        <div className={styles.metaStripe}>
          <span className={styles.metaItem}>
            <Icon name="schedule" size={18} />
            {t('kds.acceptGate.placedAt', {
              time: formatClock(ticket.placedAt, 'Africa/Cairo', locale),
            })}
          </span>
          {ticket.isPriority && (
            <span className={styles.priority}>
              <span className={styles.priorityDot} aria-hidden />
              {t('kds.acceptGate.priorityQueue')}
            </span>
          )}
        </div>
        <div className={styles.body}>
          {ticket.items.map((item) => (
            <AcceptGateItemCard key={item.orderItemId} item={item} />
          ))}
          {ticket.customerNote && (
            <div className={styles.noteBlock}>
              <span className={styles.noteIcon} aria-hidden>
                <Icon name="edit-note" size={20} />
              </span>
              <div>
                <span className={styles.noteLabel}>{t('kds.acceptGate.customerNote')}</span>
                <p className={styles.noteText}>&ldquo;{ticket.customerNote}&rdquo;</p>
              </div>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          {reasonPanelOpen && (
            <RejectReasonPanel disabled={busy} onPick={(reasonCode) => reject(reasonCode)} />
          )}
          <div className={styles.decisionRow}>
            <button
              type="button"
              className={[styles.rejectButton, reasonPanelOpen ? styles.rejectActive : '']
                .filter(Boolean)
                .join(' ')}
              disabled={busy}
              onClick={toggleReasonPanel}
            >
              <Icon name="close" size={20} />
              {t('kds.ticket.reject')}
            </button>
            <button type="button" className={styles.acceptButton} disabled={busy} onClick={accept}>
              <Icon name="check-circle" size={26} />
              {phase === 'accepted'
                ? t('kds.acceptGate.acceptedFlash')
                : t('kds.acceptGate.acceptOrder')}
            </button>
          </div>
          {error && <p className={styles.error}>{t(error)}</p>}
          <div className={styles.subnote}>
            <Icon name="info" size={16} />
            <span>{t('kds.acceptGate.acceptNote')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
