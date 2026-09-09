import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartProvider } from '../../../shared/cart-store.js';
import * as placeOrderModule from '../usecases/placeOrder.js';
import type { PlaceOutcome } from '../usecases/placeOrder.js';
import { usePlaceOrder } from './usePlaceOrder.js';

const placeOrderMock = vi.spyOn(placeOrderModule, 'placeOrder');

function wrapper({ children }: { children: React.ReactNode }) {
  return <CartProvider menuVersion="v1">{children}</CartProvider>;
}

const placed: PlaceOutcome = {
  kind: 'placed',
  order: {
    orderId: 'o1',
    orderNumber: 'A-1',
    status: 'placed',
    totalMinor: 7000,
    payAt: 'counter',
    eta: {
      lowerMinutes: 5,
      upperMinutes: 9,
      startsOnAccept: true,
      promisedLowerAt: null,
      promisedUpperAt: null,
    },
    loyalty: { pointsToEarn: 7 },
    placedAt: '2026-09-06T15:00:00+03:00',
    traceId: 't',
  },
};

describe('usePlaceOrder — idempotency key lifecycle', () => {
  it('reuses the key across a retry after a network failure, then resets on success', async () => {
    placeOrderMock.mockReset();
    placeOrderMock.mockResolvedValueOnce({ kind: 'network' } satisfies PlaceOutcome);
    placeOrderMock.mockResolvedValueOnce(placed);

    const { result } = renderHook(() => usePlaceOrder(), { wrapper });

    await act(async () => {
      await result.current.submit({});
    });
    await act(async () => {
      await result.current.submit({});
    });

    const firstKey = placeOrderMock.mock.calls[0]?.[2];
    const secondKey = placeOrderMock.mock.calls[1]?.[2];
    expect(firstKey).toBeTypeOf('string');
    expect(secondKey).toBe(firstKey); // retry replays the same request

    // a fresh placement after success gets a new key
    placeOrderMock.mockResolvedValueOnce(placed);
    await act(async () => {
      await result.current.submit({});
    });
    expect(placeOrderMock.mock.calls[2]?.[2]).not.toBe(firstKey);
  });
});
