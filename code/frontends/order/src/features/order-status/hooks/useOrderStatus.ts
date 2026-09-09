import { useCallback, useEffect, useState } from 'react';
import type { OrderStatusResponse } from '@veyroxai/contracts';
import { ApiError } from '@veyroxai/api-client';
import { loadOrderStatus } from '../usecases/loadOrderStatus.js';

type State =
  | { status: 'loading'; order: null; notFound: false }
  | { status: 'ready'; order: OrderStatusResponse; notFound: false }
  | { status: 'error'; order: null; notFound: boolean };

/**
 * Fetches the order status once, then again on window focus — never on a timer
 * (ADR-0005). The WhatsApp "ready" message is the real notification (F1.7 §4).
 */
export function useOrderStatus(orderId: string): State & { refresh: () => void } {
  const [state, setState] = useState<State>({ status: 'loading', order: null, notFound: false });

  const refresh = useCallback(() => {
    loadOrderStatus(orderId)
      .then((order) => setState({ status: 'ready', order, notFound: false }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          order: null,
          notFound: err instanceof ApiError && err.status === 404,
        }),
      );
  }, [orderId]);

  useEffect(() => {
    setState({ status: 'loading', order: null, notFound: false });
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  return { ...state, refresh };
}
