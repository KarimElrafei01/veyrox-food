import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { LocaleProvider, ThemeProvider } from '@veyroxai/ui';
import { SessionProvider } from '../shared/session-context.js';
import { sessionFixture } from '../dev/fixtures.js';
import { App } from './App.js';

beforeEach(() => {
  window.history.pushState(null, '', '/s/test-token');
});

it('redirects a re-entering customer with an open order to its live status, without flashing the menu', async () => {
  const session = {
    ...sessionFixture,
    openOrder: { orderId: 'order-1', orderNumber: 'A-1', status: 'preparing' as const },
  };

  render(
    <ThemeProvider>
      <LocaleProvider>
        <SessionProvider
          initialState={{ status: 'ready', token: 'test-token', session, error: null }}
        >
          <App />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );

  await waitFor(() => {
    expect(window.location.pathname).toBe('/o/order-1');
  });
});

it('stays on the menu when there is no open order', async () => {
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
          <App />
        </SessionProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );

  await waitFor(() => {
    expect(window.location.pathname).toBe('/s/test-token');
  });
});
