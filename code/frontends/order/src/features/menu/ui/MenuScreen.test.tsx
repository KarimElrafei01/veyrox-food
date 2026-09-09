import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@veyroxai/ui';
import { SessionProvider } from '../../../shared/session-context.js';
import { CartProvider } from '../../../shared/cart-store.js';
import { menuFixture, sessionFixture } from '../../../dev/fixtures.js';
import { MenuScreen } from './MenuScreen.js';

function renderMenu(locale: 'en' | 'ar-EG') {
  return render(
    <LocaleProvider initialLocale={locale}>
      <SessionProvider
        initialState={{ status: 'ready', token: 'x', session: sessionFixture, error: null }}
      >
        <CartProvider menuVersion={sessionFixture.session.menuVersion}>
          <MenuScreen
            menu={menuFixture}
            status="ready"
            locale={locale}
            quoteTotalMinor={null}
            onOpenItem={vi.fn()}
            onQuickAdd={vi.fn()}
            onStepItem={vi.fn()}
            onViewCart={vi.fn()}
          />
        </CartProvider>
      </SessionProvider>
    </LocaleProvider>,
  );
}

describe('MenuScreen', () => {
  it('renders items and marks an 86ed one unavailable', () => {
    renderMenu('en');
    expect(screen.getByText('Cardamom Baladi Latte')).toBeInTheDocument();
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });

  it('renders Arabic names and flips the document to RTL', () => {
    renderMenu('ar-EG');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByText('لاتيه بلدي بالهيل')).toBeInTheDocument();
  });

  it('filters by category pill', () => {
    renderMenu('en');
    fireEvent.click(screen.getByRole('button', { name: 'Cold brew' }));
    expect(screen.queryByText('Cardamom Baladi Latte')).not.toBeInTheDocument();
    expect(screen.getByText('Cold Brew Hibiscus')).toBeInTheDocument();
  });
});
