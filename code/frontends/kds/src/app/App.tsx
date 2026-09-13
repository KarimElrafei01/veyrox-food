import { useState } from 'react';
import { LocaleProvider, ThemeProvider, useT } from '@veyroxai/ui';
import { StaffSessionProvider, useStaffSession } from '../shared/staff-session.js';
import { BoardScreen } from '../features/board/ui/BoardScreen.js';
import { useBoard } from '../features/board/hooks/useBoard.js';
import { useNow } from '../features/board/hooks/useNow.js';
import { findTicketInState } from '../features/board/usecases/boardState.js';
import { AcceptGateModal } from '../features/accept-gate/ui/AcceptGateModal.js';

function NoSessionScreen(): React.JSX.Element {
  const { t } = useT();
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--vx-gutter)',
        color: 'var(--vx-on-surface)',
        background: 'var(--vx-surface)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '28rem' }}>
        <h1 style={{ fontFamily: 'var(--vx-font-display)' }}>{t('kds.noSession.title')}</h1>
        <p style={{ color: 'var(--vx-on-surface-variant)' }}>{t('kds.noSession.body')}</p>
      </div>
    </div>
  );
}

function KdsAppWithSession({
  deviceToken,
  onSessionInvalid,
}: {
  deviceToken: string;
  onSessionInvalid: () => void;
}): React.JSX.Element {
  const now = useNow();
  const board = useBoard({ deviceToken, onSessionInvalid });
  // Screens 3.2 (accept-gate) and 3.4 (ticket detail) are overlays on the
  // board's own state, opened by orderId - both stay app-level state since
  // ADR-0018 forbids the board and accept-gate features importing each
  // other, in either direction. useBoard/useNow are called once, here, and
  // passed down - a second useBoard() call would open a second EventSource.
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const openTicket =
    openTicketId && board.state ? findTicketInState(board.state, openTicketId) : null;

  return (
    <>
      <BoardScreen
        board={board}
        now={now}
        onOpenAcceptGate={setOpenTicketId}
        onOpenDetail={(orderId) => {
          // Screen 3.4 (Ticket Detail & Undo) is a later pass - no-op for now.
          console.info('Ticket detail not built yet for', orderId);
        }}
      />
      {openTicket && (
        <AcceptGateModal ticket={openTicket} now={now} onClose={() => setOpenTicketId(null)} />
      )}
    </>
  );
}

function KdsApp(): React.JSX.Element {
  const { session, clear } = useStaffSession();
  if (!session) return <NoSessionScreen />;
  return <KdsAppWithSession deviceToken={session.deviceToken} onSessionInvalid={clear} />;
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider defaultTheme="kds-industrial">
      <LocaleProvider>
        <StaffSessionProvider>
          <KdsApp />
        </StaffSessionProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
