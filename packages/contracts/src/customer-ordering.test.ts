import { describe, expect, it } from 'vitest';
import { placeOrderRequest } from './customer-ordering.js';

describe('customer ordering contracts', () => {
  it('does not accept client-supplied prices', () => {
    const result = placeOrderRequest.safeParse({
      items: [
        {
          menuItemId: '0192d425-9790-7dd9-8aa9-8cbd4c3844db',
          qty: 1,
          modifierOptionIds: [],
          unitPriceMinor: 1,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items[0]).not.toHaveProperty('unitPriceMinor');
  });
});
