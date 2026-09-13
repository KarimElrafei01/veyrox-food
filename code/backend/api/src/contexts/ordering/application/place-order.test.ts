import { describe, expect, it, vi } from 'vitest';
import { toMinor, type PricedCart } from '@veyroxai/domain';
import { PlaceOrder, ItemUnavailable, MinimumOrderValue, PriceChanged } from './place-order.js';
import type { QuoteOrder } from './quote-order.js';
import type { OrderPlacementRepository } from '../infrastructure/order-placement-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';
import type { EtaMetricSink } from './eta-metrics.js';

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
  etaSource?: 'redis' | 'postgres' | 'degraded';
}) {
  const quote = {
    execute: vi.fn(options.quote ?? (async () => pricedCart())),
  } as unknown as QuoteOrder;
  // An empty queue — no tickets ahead, one station — so the estimate is deterministic
  // and comes only from the cart's own prep time.
  const etaQueue = {
    load: vi.fn(async () => ({
      state: { activeStations: 1, tickets: [], updatedAt: '2026-09-07T00:00:00.000Z' },
      source: options.etaSource ?? ('postgres' as const),
    })),
  } as unknown as EtaQueueRepository;
  const etaMetrics = { increment: vi.fn(), gauge: vi.fn() } as unknown as EtaMetricSink;
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
      replayed: false,
      event: {
        id: 'e1',
        fromStatus: null,
        toStatus: 'placed',
        actorType: 'customer',
        createdAt: new Date('2026-09-07T00:00:00.000Z'),
      },
    }));
  const orders = {
    findReplay: options.findReplay ?? vi.fn(async () => null),
    place,
  } as unknown as OrderPlacementRepository;
  const kitchenOrders = {
    loadTicketById: vi.fn(async () => null),
  } as unknown as KitchenOrderRepository;
  const sseHub = { publish: vi.fn() } as unknown as SseHub;
  return {
    useCase: new PlaceOrder(quote, orders, etaQueue, etaMetrics, kitchenOrders, sseHub),
    place,
    findReplay: orders.findReplay,
    etaMetrics,
    kitchenOrders,
    sseHub,
  };
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

  it('propagates replayed:true when the repository detects the replay inside its lock', async () => {
    // The race findReplay() (checked before the lock) can't catch: two concurrent
    // requests both see no row, both call place(), and the repository itself finds
    // the other one's insert once it gets the advisory lock. PlaceOrder must not
    // silently turn that into "replayed: false" — that was the bug (a 201 issued,
    // OrderPlaced emitted, for a request that was actually a replay).
    const { useCase, place } = subject({
      place: vi.fn(async () => ({
        order: {
          orderId: 'o1',
          orderNumber: 'A-001',
          status: 'placed' as const,
          totalMinor: 9000,
          subtotalMinor: 9000,
          placedAt: '2026-09-07T00:00:00.000Z',
        },
        response: { orderId: 'o1', orderNumber: 'A-001', totalMinor: 9000 },
        replayed: true as const,
      })),
    });
    const result = await useCase.execute(input);
    expect(place).toHaveBeenCalledOnce();
    expect(result.replayed).toBe(true);
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

  it('estimates the ETA at placement — only the wall-clock promise waits on Accept', async () => {
    const { useCase, place } = subject({});
    await useCase.execute(input);
    const call = (place as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // 120s prep, empty queue, one station -> the same numbers estimateEta gives a
    // quote right now (F1.6 §2's worked example: a populated range, not nulls).
    expect(call.responseSeed.eta).toEqual({
      lowerMinutes: 5,
      upperMinutes: 10,
      startsOnAccept: true,
      promisedLowerAt: null,
      promisedUpperAt: null,
    });
  });

  it("still returns a pessimistic estimate — and flags it — when the queue can't be read", async () => {
    // A café with no queue signal (Redis and Postgres both unavailable) is the
    // literal "no eta" case: rather than omit the field, F1.4 §Failure mode widens
    // the range ×1.5 and counts it, so a customer never sees a blank promise.
    const { useCase, place, etaMetrics } = subject({ etaSource: 'degraded' });
    await useCase.execute(input);
    const call = (place as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.responseSeed.eta.lowerMinutes).toBeGreaterThan(0);
    expect(call.responseSeed.eta.upperMinutes).toBeGreaterThan(call.responseSeed.eta.lowerMinutes);
    expect(etaMetrics.increment).toHaveBeenCalledWith('eta_fallback_total');
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
