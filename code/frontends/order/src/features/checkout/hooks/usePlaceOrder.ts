import { useCallback, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useCart } from '../../../shared/cart-store.js';
import {
  savePlacedOrderSnapshot,
  type PlacedOrderSnapshot,
} from '../../../shared/placed-order-snapshot.js';
import { isRetryable, placeOrder, type PlaceOutcome } from '../usecases/placeOrder.js';

interface PlaceOpts {
  expectedTotalMinor?: number;
  tableLabel?: string | null;
  customerNote?: string | null;
}

export function usePlaceOrder() {
  const cart = useCart();
  const [placing, setPlacing] = useState(false);
  const [outcome, setOutcome] = useState<PlaceOutcome | null>(null);

  // One idempotency key per placement attempt. Kept across retries so a timeout
  // followed by a retry replays the original request (F1.6 §5); reset on any
  // definitive response so the next deliberate attempt is a fresh order.
  const keyRef = useRef<string | null>(null);

  const submit = useCallback(
    async (opts: PlaceOpts, displaySnapshot?: PlacedOrderSnapshot) => {
      if (placing) {
        return;
      }
      setPlacing(true);
      keyRef.current ??= uuidv7();
      const result = await placeOrder(cart.lines, opts, keyRef.current);
      setOutcome(result);
      if (result.kind === 'placed') {
        if (displaySnapshot) {
          savePlacedOrderSnapshot(result.order.orderId, {
            ...displaySnapshot,
            totalMinor: result.order.totalMinor,
          });
        }
        cart.clear();
      }
      if (!isRetryable(result)) {
        keyRef.current = null;
      }
      setPlacing(false);
      return result;
    },
    [cart, placing],
  );

  return {
    placing,
    outcome,
    clearOutcome: () => setOutcome(null),
    submit,
  };
}
