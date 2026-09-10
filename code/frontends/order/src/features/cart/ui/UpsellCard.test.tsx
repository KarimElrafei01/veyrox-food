import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LocaleProvider } from '@veyroxai/ui';
import { UpsellCard } from './UpsellCard.js';
import { MOCK_UPSELL } from '../mockUpsell.js';

it('shows the add-on and reports Add / dismiss', () => {
  const onAdd = vi.fn();
  const onDismiss = vi.fn();
  render(
    <LocaleProvider initialLocale="en">
      <UpsellCard item={MOCK_UPSELL} locale="en" onAdd={onAdd} onDismiss={onDismiss} />
    </LocaleProvider>,
  );

  expect(screen.getByText('Butter Croissant')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /add/i }));
  expect(onAdd).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));
  expect(onDismiss).toHaveBeenCalledOnce();
});
