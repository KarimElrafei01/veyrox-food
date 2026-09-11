import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@veyroxai/ui';
import { SessionProvider } from '../../../shared/session-context.js';
import { CartProvider } from '../../../shared/cart-store.js';
import { menuFixture, sessionFixture } from '../../../dev/fixtures.js';
import { MenuScreen } from './MenuScreen.js';

function renderMenu(
  locale: 'en' | 'ar-EG',
  options: { onViewActiveOrder?: () => void; openOrder?: typeof sessionFixture.openOrder } = {},
) {
  const session = { ...sessionFixture, openOrder: options.openOrder ?? sessionFixture.openOrder };
  return render(
    <LocaleProvider initialLocale={locale}>
      <SessionProvider initialState={{ status: 'ready', token: 'x', session, error: null }}>
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
            onViewActiveOrder={options.onViewActiveOrder}
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

  it('shows no active-order banner without an open order', () => {
    renderMenu('en', { onViewActiveOrder: vi.fn(), openOrder: null });
    expect(screen.queryByText('Order in progress')).not.toBeInTheDocument();
  });

  it('surfaces an active order via a banner that navigates back to its status', () => {
    const onViewActiveOrder = vi.fn();
    renderMenu('en', {
      onViewActiveOrder,
      openOrder: { orderId: 'order-1', orderNumber: 'A-27', status: 'preparing' },
    });
    const banner = screen.getByRole('button', { name: /order in progress/i });
    expect(banner).toHaveTextContent('#A-27');
    expect(banner).toHaveTextContent('Preparing');

    fireEvent.click(banner);
    expect(onViewActiveOrder).toHaveBeenCalledOnce();
  });
});
