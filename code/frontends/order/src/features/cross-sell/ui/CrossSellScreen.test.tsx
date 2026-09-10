import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LocaleProvider } from '@veyroxai/ui';
import { SessionProvider } from '../../../shared/session-context.js';
import { sessionFixture } from '../../../dev/fixtures.js';
import { CrossSellScreen } from './CrossSellScreen.js';
import { MOCK_PAIRINGS } from '../mockPairings.js';

function renderScreen(props: Partial<Parameters<typeof CrossSellScreen>[0]> = {}) {
  const onAdd = vi.fn();
  const onSkip = vi.fn();
  const onContinue = vi.fn();
  render(
    <LocaleProvider initialLocale="en">
      <SessionProvider
        initialState={{ status: 'ready', token: 'x', session: sessionFixture, error: null }}
      >
        <CrossSellScreen
          pairings={MOCK_PAIRINGS}
          itemCount={2}
          totalMinor={14500}
          locale="en"
          onAdd={onAdd}
          onSkip={onSkip}
          onContinue={onContinue}
          {...props}
        />
      </SessionProvider>
    </LocaleProvider>,
  );
  return { onAdd, onSkip, onContinue };
}

it('lists pairings and wires Add / Skip / Continue', () => {
  const { onAdd, onSkip, onContinue } = renderScreen();

  expect(screen.getByText('People also order')).toBeInTheDocument();
  expect(screen.getByText('Tahina Sea-Salt Cookie')).toBeInTheDocument();

  const addButtons = screen.getAllByRole('button', { name: /add/i });
  fireEvent.click(addButtons[0] as HTMLElement);
  expect(onAdd).toHaveBeenCalledWith(MOCK_PAIRINGS[0]);

  fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
  expect(onSkip).toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /continue to checkout/i }));
  expect(onContinue).toHaveBeenCalled();
});
