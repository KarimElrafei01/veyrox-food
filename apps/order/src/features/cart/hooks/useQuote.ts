import { useEffect, useRef, useState } from 'react';
import type { QuoteResponse } from '@veyroxai/contracts';
import { ApiError } from '@veyroxai/api-client';
import { useCart } from '../../../shared/cart-store.js';
import { quoteCart } from '../usecases/quoteCart.js';

interface QuoteState {
  quote: QuoteResponse | null;
  loading: boolean;
  errorCode: string | null;
}

/**
 * Re-quotes on every cart change, debounced. The server is the price authority
 * (F1.3 §1); this can be called freely because `/quote` has no side effects.
 */
export function useQuote(): QuoteState {
  const cart = useCart();
  const [state, setState] = useState<QuoteState>({ quote: null, loading: false, errorCode: null });
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    if (cart.lines.length === 0) {
      setState({ quote: null, loading: false, errorCode: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      quoteCart(cart.lines)
        .then((quote) => {
          if (id === seq.current) {
            setState({ quote, loading: false, errorCode: null });
          }
        })
        .catch((err: unknown) => {
          if (id === seq.current) {
            setState({
              quote: null,
              loading: false,
              errorCode: err instanceof ApiError ? err.code : 'network',
            });
          }
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [cart.lines]);

  return state;
}
