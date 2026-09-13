import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { App } from './App.js';

beforeEach(() => {
  localStorage.clear();
});

it('shows the no-session screen when no dev-injected staff session exists', () => {
  render(<App />);
  expect(document.documentElement.dir).toBe('ltr');
  expect(screen.getByText('No staff session')).toBeTruthy();
});

it('sets the kds-industrial theme on the document root', () => {
  render(<App />);
  expect(document.documentElement.dataset.theme).toBe('kds-industrial');
});
