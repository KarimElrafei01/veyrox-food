import { useState } from 'react';
import { LocaleProvider, ThemeProvider, useT } from '@veyroxai/ui';
import { StaffSessionProvider, useStaffSession } from '../shared/staff-session.js';
import { BoardScreen } from '../features/board/ui/BoardScreen.js';

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

function KdsApp(): React.JSX.Element {
  const { session, clear } = useStaffSession();
  // Screens 3.2 (accept-gate) and 3.4 (ticket detail) are overlays on the
  // board's own state, opened by orderId - both stay app-level state since
  // ADR-0018 forbids the board feature importing accept-gate's internals.
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  if (!session) return <NoSessionScreen />;

  return (
    <>
      <BoardScreen
        deviceToken={session.deviceToken}
        onSessionInvalid={clear}
        onOpenAcceptGate={setOpenTicketId}
        onOpenDetail={(orderId) => {
          // Screen 3.4 (Ticket Detail & Undo) is a later pass - no-op for now.
          console.info('Ticket detail not built yet for', orderId);
        }}
      />
      {openTicketId && <div>{/* Screen 3.2 accept-gate lands next. */}</div>}
    </>
  );
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
