import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './App.js';

it('renders the console title and flips direction on toggle', () => {
  render(<App />);
  expect(document.documentElement.dir).toBe('ltr');
  expect(screen.getByRole('heading').textContent).toBe('Store Console');

  fireEvent.click(screen.getByRole('button'));

  expect(document.documentElement.dir).toBe('rtl');
  expect(screen.getByRole('heading').textContent).toBe('لوحة المتجر');
});
