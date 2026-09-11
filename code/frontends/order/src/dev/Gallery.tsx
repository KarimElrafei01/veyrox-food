import { useEffect, useRef, useState } from 'react';
import { LocaleProvider, ThemeProvider, useT } from '@veyroxai/ui';
import { SessionProvider } from '../shared/session-context.js';
import { CartProvider, useCart } from '../shared/cart-store.js';
import { MenuScreen } from '../features/menu/ui/MenuScreen.js';
import { ItemDetailScreen } from '../features/item/ui/ItemDetailScreen.js';
import { CartScreen } from '../features/cart/ui/CartScreen.js';
import { CheckoutScreen } from '../features/checkout/ui/CheckoutScreen.js';
import { OrderStatusScreen } from '../features/order-status/ui/OrderStatusScreen.js';
import {
  LoadingScreen,
  OpenOrderBlockScreen,
  OrderingSuspendedScreen,
  SessionExpiredScreen,
  StoreClosedScreen,
} from '../features/session/ui/SessionScreens.js';
import { TierUpCelebration } from '../features/loyalty/ui/TierUpCelebration.js';
import { tierUpFixture } from './tier-up-fixture.js';
import {
  menuFixture,
  placedOrderSnapshotFixture,
  quoteFixture,
  sessionFixture,
  statusFixtures,
} from './fixtures.js';
import styles from './Gallery.module.css';

const SCREENS = [
  'menu',
  'menu-closed',
  'item',
  'cart',
  'checkout',
  'checkout-price-changed',
  'status-placed',
  'status-preparing',
  'status-rejected',
  'session-expired',
  'store-closed',
  'suspended',
  'open-order',
  'tier-up',
  'loading',
] as const;
type ScreenKey = (typeof SCREENS)[number];

const noop = () => {};

function SeedCart({
  children,
}: {
  children: (quotedByLine: Map<string, (typeof quoteFixture.lines)[number]>) => React.ReactNode;
}): React.JSX.Element {
  const cart = useCart();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) {
      return;
    }
    seeded.current = true;
    cart.clear();
    cart.addLine({
      menuItemId: menuFixture.categories[0]!.items[0]!.id,
      qty: 1,
      modifierOptionIds: [],
      nameEn: 'Cardamom Baladi Latte',
      nameAr: 'لاتيه بلدي بالهيل',
      modifierSummary: 'Large · Oat milk (free)',
      imageUrl: null,
      unitBasePriceMinor: 7000,
    });
    cart.addLine({
      menuItemId: menuFixture.categories[1]!.items[0]!.id,
      qty: 1,
      modifierOptionIds: [],
      nameEn: 'Cold Brew Hibiscus',
      nameAr: 'كركديه كولد برو',
      modifierSummary: 'Regular',
      imageUrl: null,
      unitBasePriceMinor: 6500,
    });
    // seed once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const quotedByLine = new Map(
    cart.lines.map((line, i) => [line.lineId, quoteFixture.lines[i] ?? quoteFixture.lines[0]!]),
  );
  return <>{children(quotedByLine)}</>;
}

function Body({ screen }: { screen: ScreenKey }): React.JSX.Element {
  const { locale } = useT();
  const latte = menuFixture.categories[0]!.items[0]!;
  const groups = latte.modifierGroupIds
    .map((id) => menuFixture.groupsById.get(id))
    .filter((g): g is NonNullable<typeof g> => g != null);

  switch (screen) {
    case 'loading':
      return <LoadingScreen />;
    case 'session-expired':
      return <SessionExpiredScreen reopenUrl="https://wa.me/" />;
    case 'suspended':
      return <OrderingSuspendedScreen />;
    case 'store-closed':
      return (
        <StoreClosedScreen
          storeName="Brew & Baladi"
          opensAt={new Date(Date.now() + 2.7 * 3600000).toISOString()}
          today={null}
          tomorrow={{ opens: '08:00', closes: '23:00' }}
          tier="silver"
          pointsBalance={320}
          whatsappUrl="https://wa.me/"
          onBrowse={noop}
        />
      );
    case 'open-order':
      return (
        <OpenOrderBlockScreen
          orderNumber="A-27"
          order={null}
          whatsappUrl="https://wa.me/"
          onView={noop}
        />
      );
    case 'tier-up':
      return <TierUpCelebration data={tierUpFixture} onDismiss={noop} />;
    case 'item':
      return (
        <ItemDetailScreen
          item={latte}
          groups={groups}
          optionAvailable={menuFixture.optionAvailable}
          tier="silver"
          locale={locale}
          editingLineId={null}
          onBack={noop}
          onAdd={noop}
        />
      );
    case 'cart':
      return (
        <SeedCart>
          {(quotedByLine) => (
            <CartScreen
              locale={locale}
              quote={quoteFixture}
              quotedByLine={quotedByLine}
              loading={false}
              errorCode={null}
              reconciled={false}
              reconfigureLineIds={[]}
              onEditLine={noop}
              onCheckout={noop}
              onBack={noop}
            />
          )}
        </SeedCart>
      );
    case 'checkout':
    case 'checkout-price-changed':
      return (
        <SeedCart>
          {(quotedByLine) => (
            <CheckoutScreen
              locale={locale}
              quote={quoteFixture}
              quotedByLine={quotedByLine}
              askTableNumber
              placing={false}
              outcome={
                screen === 'checkout-price-changed'
                  ? {
                      kind: 'price_changed',
                      detail: 'A price changed.',
                      quote: { ...quoteFixture, totalMinor: 15500, subtotalMinor: 15500 },
                    }
                  : null
              }
              onBack={noop}
              onEditCart={noop}
              onPlace={noop}
              onDismissPriceChange={noop}
            />
          )}
        </SeedCart>
      );
    case 'status-placed':
    case 'status-preparing':
    case 'status-rejected':
      return (
        <OrderStatusScreen
          locale={locale}
          state="ready"
          notFound={false}
          order={statusFixtures[screen.replace('status-', '')]!}
          storeName="Brew & Baladi"
          pointsBalance={320}
          orderSnapshot={placedOrderSnapshotFixture}
          onRetry={noop}
          onBackToMenu={noop}
        />
      );
    case 'menu':
      return (
        <SeedCart>
          {() => (
            <MenuScreen
              menu={menuFixture}
              status="ready"
              locale={locale}
              quoteTotalMinor={quoteFixture.totalMinor}
              onOpenItem={noop}
              onQuickAdd={noop}
              onStepItem={noop}
              onViewCart={noop}
            />
          )}
        </SeedCart>
      );
    case 'menu-closed':
    default:
      return (
        <MenuScreen
          menu={menuFixture}
          status="ready"
          locale={locale}
          quoteTotalMinor={null}
          onOpenItem={noop}
          onQuickAdd={noop}
          onStepItem={noop}
          onViewCart={noop}
        />
      );
  }
}

export function Gallery(): React.JSX.Element {
  const [screen, setScreen] = useState<ScreenKey>('menu');
  const closed = screen === 'menu-closed';
  const session = closed
    ? { ...sessionFixture, store: { ...sessionFixture.store, isOpen: false } }
    : sessionFixture;

  return (
    <ThemeProvider>
      <LocaleProvider>
        <div className={styles.shell}>
          <Toolbar screen={screen} onScreen={setScreen} />
          <div className={styles.stage}>
            <SessionProvider
              key={screen}
              initialState={{ status: 'ready', token: 'dev', session, error: null }}
            >
              <CartProvider menuVersion={sessionFixture.session.menuVersion}>
                <Body screen={screen} />
              </CartProvider>
            </SessionProvider>
          </div>
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}

function Toolbar({
  screen,
  onScreen,
}: {
  screen: ScreenKey;
  onScreen: (s: ScreenKey) => void;
}): React.JSX.Element {
  const { locale, toggleLocale } = useT();
  return (
    <div className={styles.toolbar}>
      <strong>F1 gallery</strong>
      <select value={screen} onChange={(e) => onScreen(e.target.value as ScreenKey)}>
        {SCREENS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="button" onClick={toggleLocale}>
        {locale === 'en' ? 'عربى' : 'English'}
      </button>
    </div>
  );
}
