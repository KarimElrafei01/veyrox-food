import { useT } from '@veyroxai/ui';
import type { UseBoardResult } from '../hooks/useBoard.js';
import { KdsHeader } from '../components/KdsHeader.js';
import { MetricsStrip } from '../components/MetricsStrip.js';
import { ColumnHeader } from '../components/ColumnHeader.js';
import { TicketCard } from '../components/TicketCard.js';
import { FooterBar } from '../components/FooterBar.js';
import type { ColumnKey } from '../usecases/boardState.js';
import styles from './BoardScreen.module.css';

const COLUMNS: readonly ColumnKey[] = ['new', 'received', 'preparing', 'ready'];

/** The KDS's home screen (§1.1) - persistent shell shared by every other
 *  screen in this feature, which are overlays on top of this one's live
 *  board state, not separate data-fetching roots (§1.6).
 *
 *  `board`/`now` are owned by the app shell (`src/app/App.tsx`), not this
 *  component - the accept-gate overlay (screen 3.2) needs the same live
 *  ticket data and the same clock (its waiting-time timer is explicitly the
 *  FR-3.13 age timer shared with the New card behind it, not a second
 *  clock), and ADR-0018 forbids one feature importing another's hooks, so
 *  the single `useBoard`/`useNow` call has to live above both. */
export function BoardScreen({
  board,
  now,
  onOpenAcceptGate,
  onOpenDetail,
}: {
  board: UseBoardResult;
  now: Date;
  onOpenAcceptGate: (orderId: string) => void;
  onOpenDetail: (orderId: string) => void;
}): React.JSX.Element {
  const { t } = useT();
  const { state } = board;
  if (board.loading || !state) {
    return (
      <div className={styles.page}>
        <div className={styles.centered}>{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <KdsHeader
        connected={!board.stale}
        lastUpdateSeconds={null}
        activeStations={state.activeStations}
        onChangeStations={(next) => void board.setStations(next)}
        unavailableItemCount={0}
      />
      <MetricsStrip
        metrics={state.metrics}
        lastBumpedOrderId={board.lastBumpedOrderId}
        onRecallBump={() => {
          if (board.lastBumpedOrderId) void board.revert(board.lastBumpedOrderId);
        }}
      />
      <div className={styles.rail}>
        {COLUMNS.map((column) => (
          <div key={column} className={styles.column}>
            <ColumnHeader column={column} count={state.columns[column].length} />
            <div className={styles.cards}>
              {state.columns[column].map((ticket) => (
                <TicketCard
                  key={ticket.orderId}
                  ticket={ticket}
                  column={column}
                  now={now}
                  onOpenAcceptGate={onOpenAcceptGate}
                  onAdvance={(orderId, toStatus) => void board.advance(orderId, toStatus)}
                  onOpenDetail={onOpenDetail}
                  onToggleItem={(orderId, orderItemId, ticked) =>
                    void board.tick(orderId, orderItemId, ticked)
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <FooterBar metrics={state.metrics} />
    </div>
  );
}
