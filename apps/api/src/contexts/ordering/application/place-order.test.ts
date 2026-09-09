import { describe, expect, it, vi } from 'vitest';
import { toMinor, type PricedCart } from '@veyroxai/domain';
import { PlaceOrder, ItemUnavailable, MinimumOrderValue, PriceChanged } from './place-order.js';
import type { QuoteOrder } from './quote-order.js';
import type { OrderPlacementRepository } from '../infrastructure/order-placement-repository.js';

const ITEM = '11111111-1111-4111-8111-111111111111';

function pricedCart(overrides: Partial<PricedCart> = {}): PricedCart & {
  etaItems: { prepSeconds: number }[];
} {
  return {
    lines: [
      {
        clientLineId: ITEM,
        menuItemId: ITEM,
        qty: 1,
        unitPriceMinor: toMinor(9000),
        modifierTotalMinor: toMinor(0),
        lineTotalMinor: toMinor(9000),
        modifiers: [],
      },
    ],
    subtotalMinor: toMinor(9000),
    discountMinor: toMinor(0),
    totalMinor: toMinor(9000),
    unavailable: [],
    etaItems: [{ prepSeconds: 120 }],
    ...overrides,
  };
}

function subject(options: {
  quote?: () => Promise<ReturnType<typeof pricedCart>>;
  findReplay?: OrderPlacementRepository['findReplay'];
  place?: OrderPlacementRepository['place'];
}) {
  const quote = {
    execute: vi.fn(options.quote ?? (async () => pricedCart())),
  } as unknown as QuoteOrder;
  const place =
    options.place ??
    vi.fn(async () => ({
      order: {
        orderId: 'o1',
        orderNumber: 'A-001',
        status: 'placed' as const,
        totalMinor: 9000,
        subtotalMinor: 9000,
        placedAt: '2026-09-07T00:00:00.000Z',
      },
      response: { orderId: 'o1', orderNumber: 'A-001', totalMinor: 9000 },
    }));
  const orders = {
    findReplay: options.findReplay ?? vi.fn(async () => null),
    place,
  } as unknown as OrderPlacementRepository;
  return { useCase: new PlaceOrder(quote, orders), place, findReplay: orders.findReplay };
}

const input = {
  tenantId: 'tenant',
  customerId: 'customer',
  menuVersionId: 'menu',
  tier: 'bronze' as const,
  minOrderValueMinor: 0,
  idempotencyKey: 'key',
  traceId: 'trace-1',
  request: { items: [{ clientLineId: ITEM, menuItemId: ITEM, qty: 1, modifierOptionIds: [] }] },
};

describe('PlaceOrder', () => {
  it('prices from the pinned menu and hands the frozen response back', async () => {
    const { useCase } = subject({});
    const result = await useCase.execute(input);
    expect(result.replayed).toBe(false);
    expect(result.order.orderNumber).toBe('A-001');
  });

  it('returns the stored response without re-persisting on replay (PROP-5)', async () => {
    const stored = { orderId: 'o1', orderNumber: 'A-007', totalMinor: 9000, traceId: 'original' };
    const { useCase, place } = subject({
      findReplay: vi.fn(async () => ({
        order: {
          orderId: 'o1',
          orderNumber: 'A-007',
          status: 'placed' as const,
          totalMinor: 9000,
          subtotalMinor: 9000,
          placedAt: '2026-09-07T00:00:00.000Z',
        },
        response: stored,
      })),
    });
    const first = await useCase.execute(input);
    const second = await useCase.execute({ ...input, traceId: 'trace-2' });
    expect(first.response).toEqual(stored);
    expect(second.response).toEqual(stored);
    expect(place).not.toHaveBeenCalled();
  });

  it('rejects a stale advisory total exactly and carries the fresh quote', async () => {
    const { useCase } = subject({});
    await expect(
      useCase.execute({ ...input, request: { ...input.request, expectedTotalMinor: 8999 } }),
    ).rejects.toBeInstanceOf(PriceChanged);
  });

  it('accepts an advisory total that matches to the piastre', async () => {
    const { useCase, place } = subject({});
    await useCase.execute({
      ...input,
      request: { ...input.request, expectedTotalMinor: 9000 },
    });
    expect(place).toHaveBeenCalledOnce();
  });

  it('rejects items the pinned menu now reports unavailable', async () => {
    const { useCase } = subject({
      quote: async () =>
        pricedCart({
          unavailable: [{ clientLineId: ITEM, menuItemId: ITEM, reason: 'item_unavailable' }],
        }),
    });
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ItemUnavailable);
  });

  it('rejects a cart below the configured minimum', async () => {
    const { useCase } = subject({});
    await expect(useCase.execute({ ...input, minOrderValueMinor: 10000 })).rejects.toBeInstanceOf(
      MinimumOrderValue,
    );
  });

  it('does not accrue loyalty — placement writes no loyalty fact', async () => {
    const { useCase, place } = subject({});
    await useCase.execute(input);
    const call = (place as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // A preview only — the number the confirmation message will promise on Accept.
    expect(call.responseSeed.loyalty).toEqual({ pointsToEarn: 9 });
    expect(call).not.toHaveProperty('accrue');
  });
});
