import { lazy, Suspense, useEffect } from 'react';
import { useT } from '@veyroxai/ui';
import { setApiLocale } from '../shared/api.js';
import { useSession } from '../shared/session-context.js';
import { readStoredCustomerSessionToken } from '../shared/customer-session-token.js';
import { CartProvider } from '../shared/cart-store.js';
import {
  GenericErrorScreen,
  LoadingScreen,
  OpenOrderBlockScreen,
  OrderingSuspendedScreen,
  SessionExpiredScreen,
  StoreClosedScreen,
} from '../features/session/ui/SessionScreens.js';
import { LocaleSync } from '../shared/LocaleSync.js';
import { DevLoginScreen } from '../features/session/ui/DevLoginScreen.js';
import { DevPreview } from '../features/session/ui/DevPreview.js';
import { DevSwitcher, isDevSession } from '../features/session/ui/DevSwitcher.js';
import { useDevSessions } from '../features/session/hooks/useDevSessions.js';
import { useOrderStatus } from '../features/order-status/hooks/useOrderStatus.js';
import { useRoute } from './router.js';
import { Flow } from './Flow.js';

const Gallery = lazy(() => import('../dev/Gallery.js').then((m) => ({ default: m.Gallery })));
const TierUpDev = lazy(() => import('../dev/TierUpDev.js').then((m) => ({ default: m.TierUpDev })));

/** wa.me deep link back into WhatsApp for a fresh session. */
const REOPEN_URL = 'https://wa.me/';

function isCustomerRoute(routeName: ReturnType<typeof useRoute>['name']): boolean {
  return ['menu', 'item', 'cart', 'crosssell', 'checkout', 'status'].includes(routeName);
}

export function App(): React.JSX.Element {
  const route = useRoute();
  const { status, error, session, resolve } = useSession();
  const { locale } = useT();
  const entryToken = route.name === 'entry' ? route.params.token : null;
  const restoredToken = isCustomerRoute(route.name) ? readStoredCustomerSessionToken() : null;
  const sessionToken = entryToken ?? restoredToken;

  const noToken = route.name === 'entry' && !entryToken && status === 'idle';
  const devSessions = useDevSessions(noToken);

  // Keep the API's Accept-Language aligned with the chosen locale.
  useEffect(() => {
    setApiLocale(locale);
  }, [locale]);

  // Internal routes omit the token from the URL, so restore the tab-scoped copy
  // and have the API verify it again before rendering customer data.
  useEffect(() => {
    if (sessionToken && status === 'idle') {
      void resolve(sessionToken);
    }
  }, [sessionToken, status, resolve]);

  if (route.name === 'dev' && import.meta.env.DEV) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Gallery />
      </Suspense>
    );
  }

  if (route.name === 'tierUpDev' && import.meta.env.DEV) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <TierUpDev />
      </Suspense>
    );
  }

  // Static previews of the terminal states, reached from the dev picker.
  if (route.name === 'preview' && (import.meta.env.DEV || isDevSession())) {
    return <DevPreview state={route.params.state ?? ''} onBack={() => route.navigate('/')} />;
  }

  if (noToken) {
    if (devSessions.status === 'loading' || devSessions.status === 'idle') {
      return <LoadingScreen />;
    }
    if (devSessions.status === 'available') {
      return (
        <DevLoginScreen
          cafes={devSessions.cafes}
          onPick={(token) => {
            try {
              sessionStorage.setItem('vx.dev', '1');
            } catch {
              /* private mode */
            }
            window.location.assign(`/s/${token}`);
          }}
        />
      );
    }
    return <GenericErrorScreen onRetry={() => window.location.assign(REOPEN_URL)} />;
  }

  // A direct internal URL without a recoverable tab session must not spin
  // indefinitely. It has the same customer action as an expired session.
  if (status === 'idle' && !sessionToken) {
    return <SessionExpiredScreen reopenUrl={REOPEN_URL} />;
  }

  if (status === 'idle' || status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'error' && error) {
    switch (error.kind) {
      case 'store_closed':
        return <StoreClosedScreen storeName="" opensAt={error.opensAt} />;
      case 'ordering_suspended':
        return <OrderingSuspendedScreen />;
      case 'expired':
      case 'invalid':
        return <SessionExpiredScreen reopenUrl={REOPEN_URL} />;
      default:
        return (
          <GenericErrorScreen onRetry={() => route.params.token && resolve(route.params.token)} />
        );
    }
  }

  if (status === 'ready' && session) {
    // A re-entering customer (app/browser closed and reopened) with an order still
    // in progress sees the block screen first, not the menu or the live status
    // directly — they choose to view it, rather than being dropped onto it.
    if (route.name === 'entry' && session.openOrder) {
      const openOrder = session.openOrder;
      return (
        <OpenOrderRoute
          orderId={openOrder.orderId}
          orderNumber={openOrder.orderNumber}
          onView={() => route.navigate(`/o/${openOrder.orderId}`, { replace: true })}
        />
      );
    }
    // F1.1 §6 (spec correction 2026-09-11): a closed café still resolves — browsing
    // is allowed, only placement gates on hours. Entry alone shows the interstitial;
    // once inside `/menu` the persistent banner there is enough (no repeat popup).
    if (route.name === 'entry' && !session.store.isOpen) {
      return (
        <StoreClosedScreen
          storeName={session.tenant.name}
          opensAt={session.store.opensAt ?? null}
          today={session.store.today}
          tomorrow={session.store.tomorrow}
          tier={session.customer.tier}
          pointsBalance={session.customer.pointsBalance}
          whatsappUrl={REOPEN_URL}
          onBrowse={() => route.navigate('/menu', { replace: true })}
        />
      );
    }
    return (
      <CartProvider menuVersion={session.session.menuVersion}>
        <LocaleSync sessionLocale={session.session.locale} />
        <Flow />
        {isDevSession() ? <DevSwitcher /> : null}
      </CartProvider>
    );
  }

  return <LoadingScreen />;
}

/** Fetches the blocked order's live status (ETA, total, statusLabel) for the
 *  richer open-order block screen — falling back to just the order number if
 *  the fetch is still loading or fails. */
function OpenOrderRoute({
  orderId,
  orderNumber,
  onView,
}: {
  orderId: string;
  orderNumber: string;
  onView: () => void;
}): React.JSX.Element {
  const status = useOrderStatus(orderId);
  return (
    <OpenOrderBlockScreen
      orderNumber={orderNumber}
      order={status.status === 'ready' ? status.order : null}
      whatsappUrl={REOPEN_URL}
      onView={onView}
    />
  );
}
