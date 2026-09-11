import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LocaleProvider, ThemeProvider } from '@veyroxai/ui';
import { SessionProvider } from '../../../shared/session-context.js';
import {
  placedOrderSnapshotFixture,
  sessionFixture,
  statusFixtures,
} from '../../../dev/fixtures.js';
import { OrderStatusScreen } from './OrderStatusScreen.js';

function renderPreparing(): void {
  render(
    <ThemeProvider>
      <LocaleProvider>
        <SessionProvider
          initialState={{
            status: 'ready',
            token: 'test-token',
            session: sessionFixture,
            error: null,
          }}
        >
          <OrderStatusScreen
            locale="en"
            state="ready"
            notFound={false}
            order={statusFixtures.preparing!}
            storeName="Brew & Baladi"
            pointsBalance={320}
            orderSnapshot={placedOrderSnapshotFixture}
            onRetry={() => {}}
            onBackToMenu={() => {}}
          />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}

it('shows current loyalty balance with an honest collection promise', () => {
  renderPreparing();

  expect(screen.getByText('+18 points will be added once you receive your order')).toBeVisible();
  expect(screen.getByText('320 pts total')).toBeVisible();
});

it('expands and collapses the placement receipt', () => {
  renderPreparing();

  const toggle = screen.getByRole('button', { name: /order details/i });
  expect(screen.getByText(/Cardamom Baladi Latte/)).toBeVisible();
  fireEvent.click(toggle);
  expect(screen.queryByText(/Cardamom Baladi Latte/)).not.toBeInTheDocument();
});
