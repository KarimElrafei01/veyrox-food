import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LocaleProvider, ThemeProvider } from '@veyroxai/ui';
import { DevLoginScreen } from './DevLoginScreen.js';
import type { DevSessionCafe } from '../datasource/devSessionsDatasource.js';

const cafes: DevSessionCafe[] = [
  {
    tenantId: '11111111-1111-4111-8111-111111111111',
    name: 'Brew & Baladi',
    slug: 'brew-and-baladi',
    isDefault: true,
    users: [
      { customerId: 'c1', name: 'fresh', tier: 'bronze', token: 'tok-fresh' },
      { customerId: 'c2', name: 'gold', tier: 'gold', token: 'tok-gold' },
    ],
  },
];

it('lists customers and reports the picked token', () => {
  const onPick = vi.fn();
  render(
    <ThemeProvider>
      <LocaleProvider>
        <DevLoginScreen cafes={cafes} onPick={onPick} />
      </LocaleProvider>
    </ThemeProvider>,
  );

  expect(screen.getByText(/Brew & Baladi · default/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /gold · gold/ }));

  expect(onPick).toHaveBeenCalledWith('tok-gold');
});
