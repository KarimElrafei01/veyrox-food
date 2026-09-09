import { describe, expect, it } from 'vitest';
import { placeOrderRequest, updateLocaleRequest } from './customer-ordering.js';

const LINE = {
  clientLineId: '0192d425-9790-7dd9-8aa9-8cbd4c3844dc',
  menuItemId: '0192d425-9790-7dd9-8aa9-8cbd4c3844db',
  qty: 1,
  modifierOptionIds: [],
};

describe('customer ordering request contracts', () => {
  it('does not accept client-supplied prices', () => {
    const result = placeOrderRequest.parse({ items: [{ ...LINE, unitPriceMinor: 1 }] });
    expect(result.items[0]).not.toHaveProperty('unitPriceMinor');
  });

  it('requires a client line ID for quote reconciliation', () => {
    const { clientLineId: _clientLineId, ...withoutLineId } = LINE;
    expect(placeOrderRequest.safeParse({ items: [withoutLineId] }).success).toBe(false);
  });

  it('requires a monotonic sequence when updating a locale', () => {
    expect(updateLocaleRequest.safeParse({ locale: 'ar-EG' }).success).toBe(false);
    expect(updateLocaleRequest.safeParse({ locale: 'ar-EG', sequence: 0 }).success).toBe(true);
  });
});
