import { useCallback, useState } from 'react';
import { useCart } from '../../../shared/cart-store.js';
import { placeOrder, type PlaceOutcome } from '../usecases/placeOrder.js';

export function usePlaceOrder() {
  const cart = useCart();
  const [placing, setPlacing] = useState(false);
  const [outcome, setOutcome] = useState<PlaceOutcome | null>(null);

  const submit = useCallback(
    async (opts: {
      expectedTotalMinor?: number;
      tableLabel?: string | null;
      customerNote?: string | null;
    }) => {
      if (placing) {
        return;
      }
      setPlacing(true);
      const result = await placeOrder(cart.lines, opts);
      setOutcome(result);
      if (result.kind === 'placed') {
        cart.clear();
      }
      setPlacing(false);
      return result;
    },
    [cart, placing],
  );

  return { placing, outcome, clearOutcome: () => setOutcome(null), submit };
}
