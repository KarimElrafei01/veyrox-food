import { expect, it } from 'vitest';
import type { QuoteResponse } from '@veyroxai/contracts';
import {
  createPlacedOrderSnapshot,
  readPlacedOrderSnapshot,
  savePlacedOrderSnapshot,
} from './placed-order-snapshot.js';
import type { CartLine } from './cart-store.js';

const lines: CartLine[] = [
  {
    lineId: 'line-1',
    menuItemId: 'item-1',
    qty: 2,
    modifierOptionIds: [],
    nameEn: 'Cardamom latte',
    modifierSummary: 'Large · Oat milk',
    imageUrl: '/public/menu-images/version/item',
    unitBasePriceMinor: 7000,
  },
];

const quote: QuoteResponse = {
  lines: [
    {
      clientLineId: 'line-1',
      menuItemId: 'item-1',
      qty: 2,
      unitPriceMinor: 7000,
      modifierTotalMinor: 0,
      lineTotalMinor: 14000,
      modifiers: [],
    },
  ],
  subtotalMinor: 14000,
  discountMinor: 0,
  totalMinor: 14000,
  eta: { lowerMinutes: 8, upperMinutes: 12 },
  loyalty: { pointsToEarn: 18, tier: 'silver' },
  unavailable: [],
  payAt: 'counter',
  traceId: 'trace',
};

it('stores the placement display snapshot by order for an internal-route refresh', () => {
  const snapshot = createPlacedOrderSnapshot(lines, quote);
  savePlacedOrderSnapshot('order-1', snapshot);

  expect(readPlacedOrderSnapshot('order-1')).toEqual({
    ...snapshot,
    lines: [{ ...snapshot.lines[0], lineTotalMinor: 14000 }],
  });
});

it('does not trust a malformed snapshot from tab storage', () => {
  sessionStorage.setItem('vx.placed-order.order-1', JSON.stringify({ lines: 'not an array' }));

  expect(readPlacedOrderSnapshot('order-1')).toBeNull();
});
