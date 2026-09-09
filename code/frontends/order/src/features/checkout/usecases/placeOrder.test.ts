import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@veyroxai/api-client';
import type { PlaceOrderResponse } from '@veyroxai/contracts';
import { placeOrder } from './placeOrder.js';
import type { CartLine } from '../../../shared/cart-store.js';

const lines: CartLine[] = [
  {
    lineId: 'l1',
    menuItemId: '11000000-0000-4000-8000-000000000020',
    qty: 2,
    modifierOptionIds: [],
    nameEn: 'Latte',
    unitBasePriceMinor: 7000,
  },
];

const placed: PlaceOrderResponse = {
  orderId: 'o1',
  orderNumber: 'A-047',
  status: 'placed',
  totalMinor: 14000,
  payAt: 'counter',
  eta: {
    lowerMinutes: 8,
    upperMinutes: 12,
    startsOnAccept: true,
    promisedLowerAt: null,
    promisedUpperAt: null,
  },
  loyalty: { pointsToEarn: 16 },
  placedAt: '2026-09-06T15:31:12+03:00',
  traceId: 't',
};

describe('placeOrder usecase', () => {
  it('passes the caller idempotency key through and returns the placed order', async () => {
    const call = vi.fn((_req: unknown, _key: string) => Promise.resolve(placed));
    const out = await placeOrder(lines, {}, 'key-1', { placeOrder: call });
    expect(out).toEqual({ kind: 'placed', order: placed });
    expect(call.mock.calls[0]?.[1]).toBe('key-1');
    // request carries clientLineId + ids/qty, never a price
    expect(JSON.stringify(call.mock.calls[0]?.[0])).not.toMatch(/unitPrice|priceMinor/);
    expect(JSON.stringify(call.mock.calls[0]?.[0])).toMatch(/clientLineId/);
  });

  it('maps PRICE_CHANGED to a fresh quote', async () => {
    const problem = {
      code: 'PRICE_CHANGED',
      status: 409,
      detail: 'changed',
      quote: {
        lines: [],
        subtotalMinor: 15000,
        discountMinor: 0,
        totalMinor: 15000,
        eta: { lowerMinutes: 8, upperMinutes: 12 },
        loyalty: { pointsToEarn: 16, tier: 'silver' },
        unavailable: [],
        payAt: 'counter',
        traceId: 't',
      },
    };
    const call = vi.fn(async () => {
      throw new ApiError(409, problem, null);
    });
    const out = await placeOrder(lines, {}, 'k', { placeOrder: call });
    expect(out.kind).toBe('price_changed');
    if (out.kind === 'price_changed') {
      expect(out.quote.totalMinor).toBe(15000);
    }
  });

  it('maps OPEN_ORDER_LIMIT to the existing order', async () => {
    const call = vi.fn(async () => {
      throw new ApiError(
        409,
        {
          code: 'OPEN_ORDER_LIMIT',
          status: 409,
          detail: 'x',
          existingOrder: { orderId: 'o9', orderNumber: 'A-041', status: 'ready' },
        },
        null,
      );
    });
    const out = await placeOrder(lines, {}, 'k', { placeOrder: call });
    expect(out).toMatchObject({ kind: 'open_order', orderNumber: 'A-041', orderId: 'o9' });
  });

  it('maps a transport failure to network', async () => {
    const call = vi.fn(async () => {
      throw new NetworkError(new Error('offline'));
    });
    const out = await placeOrder(lines, {}, 'k', { placeOrder: call });
    expect(out.kind).toBe('network');
  });
});
