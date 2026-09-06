import { describe, expect, it } from 'vitest';
import { placeOrderRequest, quoteOrderRequest } from './customer-ordering.js';

const ITEM = '11000000-0000-4000-8000-000000000020';

describe('customer ordering — request contracts', () => {
  it('does not accept client-supplied prices (there is nowhere to put one)', () => {
    const parsed = placeOrderRequest.parse({
      items: [{ menuItemId: ITEM, qty: 1, modifierOptionIds: [], unitPriceMinor: 1 }],
      expectedTotalMinor: 9000,
    });
    expect('unitPriceMinor' in parsed.items[0]!).toBe(false);
  });

  it('carries an optional clientLineId for quote correlation (F1.3 §2)', () => {
    const parsed = quoteOrderRequest.parse({
      items: [{ clientLineId: 'l-1', menuItemId: ITEM, qty: 2, modifierOptionIds: [] }],
    });
    expect(parsed.items[0]?.clientLineId).toBe('l-1');
  });
});
