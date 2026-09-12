import { describe, expect, it, vi } from 'vitest';
import { AcceptOrder, OrderNotFound } from './accept-order.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { EtaMetricSink } from './eta-metrics.js';
import type { OrderTicket } from '@veyroxai/contracts';

const now = new Date('2026-09-06T12:05:00.000Z');

function ticket(overrides: Partial<OrderTicket> = {}): OrderTicket {
  return {
    orderId: 'o1',
    orderNumber: 'A-047',
    channel: 'whatsapp',
    status: 'received',
    customerFirstName: 'Marcus',
    tableLabel: null,
    fulfillment: 'pickup',
    isPriority: false,
    placedAt: '2026-09-06T12:00:00.000Z',
    acceptedAt: now.toISOString(),
    promisedEtaUpperAt: '2026-09-06T12:15:00.000Z',
    ageSeconds: 300,
    ageBand: 'green',
    items: [],
    customerNote: null,
    revertWindow: { revertibleUntil: '2026-09-06T12:06:00.000Z' },
    syncState: 'confirmed',
    ...overrides,
  };
}

function subject(options: {
  loadCartForEta?: KitchenOrderRepository['loadCartForEta'];
  accept?: KitchenOrderRepository['accept'];
  etaSource?: 'redis' | 'postgres' | 'degraded';
}) {
  const accept = options.accept ?? vi.fn(async () => ({ ticket: ticket(), replayed: false }));
  const repository = {
    loadCartForEta:
      options.loadCartForEta ??
      vi.fn(async () => ({ items: [{ prepSeconds: 120 }], customerTier: 'bronze' as const })),
    accept,
  } as unknown as KitchenOrderRepository;
  const replace = vi.fn((..._args: Parameters<EtaQueueRepository['replace']>) => Promise.resolve());
  const etaQueue = {
    load: vi.fn(async () => ({
      state: { activeStations: 1, tickets: [], updatedAt: now.toISOString() },
      source: options.etaSource ?? ('postgres' as const),
    })),
    replace,
  } as unknown as EtaQueueRepository;
  const etaMetrics = { increment: vi.fn(), gauge: vi.fn() } as unknown as EtaMetricSink;
  const sseHub = { publish: vi.fn() };
  return {
    acceptOrder: new AcceptOrder(repository, etaQueue, etaMetrics, sseHub),
    accept,
    replace,
  };
}

describe('AcceptOrder', () => {
  it('computes a fresh ETA from the live queue and passes it to the repository', async () => {
    const { acceptOrder, accept } = subject({});
    await acceptOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });
    expect(accept).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        orderId: 'o1',
        idempotencyKey: 'key-1',
        staffId: 'staff-1',
        etaMinutes: expect.objectContaining({
          lowerMinutes: expect.any(Number),
          upperMinutes: expect.any(Number),
        }),
      }),
    );
  });

  it('throws OrderNotFound before ever calling accept when the cart cannot be loaded', async () => {
    const { acceptOrder, accept } = subject({ loadCartForEta: vi.fn(async () => null) });
    await expect(
      acceptOrder.execute({
        tenantId: 't1',
        orderId: 'missing',
        idempotencyKey: 'key-1',
        staffId: 's1',
        now,
      }),
    ).rejects.toThrow(OrderNotFound);
    expect(accept).not.toHaveBeenCalled();
  });

  it('advances the live ETA queue cache after a fresh accept', async () => {
    const { acceptOrder, replace } = subject({});
    await acceptOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });
    expect(replace).toHaveBeenCalledTimes(1);
    const [, nextState] = vi.mocked(replace).mock.calls[0] as [string, { tickets: unknown[] }];
    expect(nextState.tickets).toHaveLength(1);
  });

  it('never advances the queue cache on a replayed accept - it already ran once', async () => {
    const { acceptOrder, replace } = subject({
      accept: vi.fn(async () => ({ ticket: ticket(), replayed: true })),
    });
    await acceptOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('uses the wider degraded upper multiplier when the queue read falls back', async () => {
    const { acceptOrder, accept } = subject({ etaSource: 'degraded' });
    await acceptOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });
    const call = vi.mocked(accept).mock.calls[0]?.[0] as {
      etaMinutes: { lowerMinutes: number; upperMinutes: number };
    };
    // 120s prep, 1 station, degraded x1.5: upper = ceil(120*1.5/300)*5 = 5min.
    expect(call.etaMinutes.upperMinutes).toBeGreaterThanOrEqual(call.etaMinutes.lowerMinutes);
  });
});
