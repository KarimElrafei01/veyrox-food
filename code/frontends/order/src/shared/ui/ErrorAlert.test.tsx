import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LocaleProvider } from '@veyroxai/ui';
import { ErrorAlert } from './ErrorAlert.js';

it('shows the message and a retry button only when onRetry is given', () => {
  const onRetry = vi.fn();
  const { rerender } = render(
    <LocaleProvider initialLocale="en">
      <ErrorAlert messageKey="error.network" />
    </LocaleProvider>,
  );
  expect(screen.getByText("We couldn't reach the café.")).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();

  rerender(
    <LocaleProvider initialLocale="en">
      <ErrorAlert messageKey="error.network" onRetry={onRetry} />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(onRetry).toHaveBeenCalledOnce();
});
