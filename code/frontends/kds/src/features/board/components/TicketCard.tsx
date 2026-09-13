import { Icon, useT } from '@veyroxai/ui';
import { formatMmSs } from '@veyroxai/i18n';
import type { OrderTicket } from '@veyroxai/contracts';
import type { ColumnKey } from '../usecases/boardState.js';
import { ItemLine } from './ItemLine.js';
import styles from './TicketCard.module.css';

const AGE_CLASS = {
  green: styles['age-green'],
  amber: styles['age-amber'],
  red: styles['age-red'],
};
const TIMER_CLASS = { green: styles.timerGreen, amber: styles.timerAmber, red: styles.timerRed };
const NEW_TICKET_ACTIONABLE_SECONDS = 120; // FR-3.13

export function TicketCard({
  ticket,
  column,
  now,
  onOpenAcceptGate,
  onAdvance,
  onOpenDetail,
  onToggleItem,
}: {
  ticket: OrderTicket;
  column: ColumnKey;
  now: Date;
  onOpenAcceptGate: (orderId: string) => void;
  onAdvance: (orderId: string, toStatus: 'preparing' | 'ready') => void;
  onOpenDetail: (orderId: string) => void;
  onToggleItem: (orderId: string, orderItemId: string, ticked: boolean) => void;
}): React.JSX.Element {
  const { t } = useT();
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(ticket.placedAt).getTime()) / 1000),
  );
  const isNewActionable = column === 'new' && elapsedSeconds > NEW_TICKET_ACTIONABLE_SECONDS;
  const isCritical = ticket.ageBand === 'red';

  const handleCardClick = (): void => {
    if (column === 'new') onOpenAcceptGate(ticket.orderId);
    else if (column === 'received') onAdvance(ticket.orderId, 'preparing');
    else if (column === 'preparing') onAdvance(ticket.orderId, 'ready');
    // Ready has no further advance from this feature (Till's own collect flow finalizes it).
  };

  return (
    <article
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') handleCardClick();
      }}
    >
      {isCritical ? (
        <div className={[styles.banner, styles['banner-critical']].join(' ')}>
          <span>
            <Icon name="warning" size={14} /> {t('kds.ticket.criticalLate')}
          </span>
          <span dir="ltr" className={styles.bannerTimer}>
            {formatMmSs(elapsedSeconds * 1000)}
          </span>
        </div>
      ) : isNewActionable ? (
        <div className={[styles.banner, styles['banner-waiting']].join(' ')}>
          <span>
            <Icon name="timer" size={14} />{' '}
            {t('kds.ticket.waitingAction', { time: formatMmSs(elapsedSeconds * 1000) })}
          </span>
          <span dir="ltr" className={styles.bannerTimer}>
            {formatMmSs(elapsedSeconds * 1000)}
          </span>
        </div>
      ) : (
        <div className={[styles.topBar, AGE_CLASS[ticket.ageBand]].join(' ')} aria-hidden />
      )}

      <div
        className={styles.header}
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetail(ticket.orderId);
        }}
      >
        <div className={styles.headerLeft}>
          <Icon name={ticket.channel === 'whatsapp' ? 'chat' : 'storefront'} size={20} />
          <span className={styles.orderName}>
            {ticket.orderNumber} {ticket.customerFirstName ?? ''}
          </span>
        </div>
        {!isCritical && !isNewActionable && (
          <span dir="ltr" className={[styles.timer, TIMER_CLASS[ticket.ageBand]].join(' ')}>
            {formatMmSs(elapsedSeconds * 1000)}
          </span>
        )}
      </div>

      <div className={styles.channelRow}>
        <span className={styles.channelChip}>
          {ticket.channel === 'whatsapp' ? t('kds.ticket.whatsapp') : t('kds.ticket.till')}
        </span>
        <span className={styles.fulfillmentLabel}>
          {ticket.tableLabel ?? t('kds.ticket.pickup')}
        </span>
      </div>

      <div className={styles.itemsBox}>
        {ticket.items.map((item) => (
          <ItemLine
            key={item.orderItemId}
            item={item}
            onToggle={(ticked) => onToggleItem(ticket.orderId, item.orderItemId, ticked)}
          />
        ))}
      </div>

      {column === 'new' &&
        (isNewActionable ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionAccept}
              onClick={(event) => {
                event.stopPropagation();
                onOpenAcceptGate(ticket.orderId);
              }}
            >
              {t('kds.ticket.accept')}
            </button>
            <button
              type="button"
              className={styles.actionReject}
              onClick={(event) => {
                event.stopPropagation();
                onOpenAcceptGate(ticket.orderId);
              }}
            >
              {t('kds.ticket.reject')}
            </button>
          </div>
        ) : null)}

      {column === 'received' && (
        <button
          type="button"
          className={styles.actionPrimary}
          onClick={(event) => {
            event.stopPropagation();
            onAdvance(ticket.orderId, 'preparing');
          }}
        >
          {t('kds.ticket.startTicket')}
        </button>
      )}

      {column === 'preparing' && (
        <button
          type="button"
          className={isCritical ? styles.actionRush : styles.actionPrimary}
          onClick={(event) => {
            event.stopPropagation();
            onAdvance(ticket.orderId, 'ready');
          }}
        >
          {isCritical ? `${t('kds.ticket.bumpToReady')} · RUSH` : t('kds.ticket.bumpToReady')}
        </button>
      )}

      {column === 'ready' && (
        // No status transition and no backend call: per backend doc §2.6, this
        // is not the collection event - only Till's own POST /orders/:id/collect
        // finalizes a Ready order. Visual-only for this pass; stopPropagation
        // keeps it from bubbling into a card body that has no advance handler
        // for this column anyway.
        <button
          type="button"
          className={styles.actionReady}
          onClick={(event) => event.stopPropagation()}
        >
          {t('kds.ticket.expediteDeliver')}
        </button>
      )}

      {(column === 'received' || column === 'preparing') && (
        <p className={styles.footerHint}>{t('kds.ticket.tapToAdvance')}</p>
      )}
    </article>
  );
}
