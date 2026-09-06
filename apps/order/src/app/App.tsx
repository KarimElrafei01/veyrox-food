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
import { useRoute } from './router.js';
import { Flow } from './Flow.js';

const Gallery = lazy(() => import('../dev/Gallery.js').then((m) => ({ default: m.Gallery })));

/** wa.me deep link back into WhatsApp for a fresh session. */
const REOPEN_URL = 'https://wa.me/';

export function App(): React.JSX.Element {
  const route = useRoute();
  const { status, error, session, resolve } = useSession();
  const { locale } = useT();

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

  if (route.name === 'dev' && import.meta.env.DEV) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Gallery />
      </Suspense>
    );
  }

  if (route.name === 'entry' && !route.params.token && status === 'idle') {
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
        <Flow />
      </CartProvider>
    );
  }

  return <LoadingScreen />;
}
