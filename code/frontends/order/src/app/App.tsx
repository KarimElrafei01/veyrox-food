import { lazy, Suspense, useEffect } from 'react';
import { useT } from '@veyroxai/ui';
import { setApiLocale } from '../shared/api.js';
import { useSession } from '../shared/session-context.js';
import { CartProvider } from '../shared/cart-store.js';
import {
  GenericErrorScreen,
  LoadingScreen,
  OrderingSuspendedScreen,
  SessionExpiredScreen,
  StoreClosedScreen,
} from '../features/session/ui/SessionScreens.js';
import { LocaleSync } from '../shared/LocaleSync.js';
import { DevLoginScreen } from '../features/session/ui/DevLoginScreen.js';
import { DevPreview } from '../features/session/ui/DevPreview.js';
import { DevSwitcher, isDevSession } from '../features/session/ui/DevSwitcher.js';
import { useDevSessions } from '../features/session/hooks/useDevSessions.js';
import { useRoute } from './router.js';
import { Flow } from './Flow.js';

const Gallery = lazy(() => import('../dev/Gallery.js').then((m) => ({ default: m.Gallery })));

/** wa.me deep link back into WhatsApp for a fresh session. */
const REOPEN_URL = 'https://wa.me/';

export function App(): React.JSX.Element {
  const route = useRoute();
  const { status, error, session, resolve } = useSession();
  const { locale } = useT();

  const noToken = route.name === 'entry' && !route.params.token && status === 'idle';
  const devSessions = useDevSessions(noToken);

  // Keep the API's Accept-Language aligned with the chosen locale.
  useEffect(() => {
    setApiLocale(locale);
  }, [locale]);

  // Resolve the session from the entry token.
  useEffect(() => {
    if (route.name === 'entry' && route.params.token && status === 'idle') {
      void resolve(route.params.token);
    }
  }, [route.name, route.params.token, status, resolve]);

  // A re-entering customer with an order still in progress goes straight to its live
  // status (F1.6 — one order at a time), not the menu.
  useEffect(() => {
    if (status === 'ready' && route.name === 'entry' && session?.openOrder) {
      route.navigate(`/o/${session.openOrder.orderId}`, { replace: true });
    }
  }, [status, route, session]);

  if (route.name === 'dev' && import.meta.env.DEV) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Gallery />
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

  if (status === 'idle' || status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'error' && error) {
    switch (error.kind) {
      case 'store_closed':
        return <StoreClosedScreen storeName="" opensAt={error.opensAt} timezone="Africa/Cairo" />;
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
