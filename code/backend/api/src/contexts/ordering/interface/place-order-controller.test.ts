import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintCustomerSession } from '../../identity/domain/index.js';
import type { PlaceOrder } from '../application/place-order.js';
import { PriceChanged } from '../application/place-order.js';
import { OpenOrderLimit } from '../infrastructure/order-placement-repository.js';
import type { ResolveCustomerSession } from '../application/resolve-customer-session.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { EtaMetricSink } from '../application/eta-metrics.js';

const KEY = 'test-session-key';
const IDEMPOTENCY = '0192d425-9790-7dd9-8aa9-8cbd4c3844db';

function token() {
  return mintCustomerSession(
    {
      tenantId: 't1',
      customerId: 'c1',
      waId: '2010',
      menuVersionId: 'm1',
      tier: 'bronze',
      locale: 'en',
      issuedAt: 0,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    KEY,
  );
}

const storedResponse = {
  orderId: 'o1',
  orderNumber: 'A-042',
  status: 'placed',
  totalMinor: 9000,
  payAt: 'counter',
  eta: {
    lowerMinutes: null,
    upperMinutes: null,
    startsOnAccept: true,
    promisedLowerAt: null,
    promisedUpperAt: null,
  },
  loyalty: { pointsToEarn: 9 },
  placedAt: '2026-09-07T00:00:00.000Z',
  traceId: 'original-trace',
};

function harness(placeImpl: PlaceOrder['execute'], emit = vi.fn(async () => {})) {
  const place = { execute: vi.fn(placeImpl) } as unknown as PlaceOrder;
  const resolver = {
    execute: vi.fn(async () => ({
      customer: { tier: 'bronze' as const },
      ordering: { minOrderValueMinor: 0 },
    })),
  } as unknown as ResolveCustomerSession;
  const etaQueue = {
    load: vi.fn(async () => ({
      state: { activeStations: 1, tickets: [], updatedAt: '' },
      source: 'postgres' as const,
    })),
  } as unknown as EtaQueueRepository;
  const metrics = { increment: vi.fn(), observe: vi.fn() };
  const etaMetrics = { increment: vi.fn(), gauge: vi.fn() } as unknown as EtaMetricSink;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    whatsappWebhook: {
      appSecret: 'x',
      events: { insertIfAbsent: async () => false },
      queue: { enqueue: async () => {} },
    },
    placeOrder: { place, resolver, keys: [KEY], etaQueue, etaMetrics, metrics, emit },
  }).then((app) => ({ app, place, emit, metrics, etaMetrics }));
}

const payload = JSON.stringify({
  items: [{ clientLineId: IDEMPOTENCY, menuItemId: IDEMPOTENCY, qty: 1, modifierOptionIds: [] }],
});
const headers = () => ({
  authorization: `Bearer ${token()}`,
  'idempotency-key': IDEMPOTENCY,
  'content-type': 'application/json',
});

describe('POST /public/orders', () => {
  it('parses the JSON body even though the webhook route wants raw bytes', async () => {
    const { app, place } = await harness(async () => ({
      order: {
        orderId: 'o1',
        orderNumber: 'A-042',
        status: 'placed',
        totalMinor: 9000,
        subtotalMinor: 9000,
        placedAt: storedResponse.placedAt,
      },
      response: storedResponse,
      replayed: false,
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/public/orders',
      headers: headers(),
      payload,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(storedResponse);
    expect(
      (place.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0].request.items,
    ).toHaveLength(1);
    await app.close();
  });

  it('returns the frozen body with a replay header on the second call', async () => {
    const { app, emit } = await harness(async () => ({
      order: {
        orderId: 'o1',
        orderNumber: 'A-042',
        status: 'placed',
        totalMinor: 9000,
        subtotalMinor: 9000,
        placedAt: storedResponse.placedAt,
      },
      response: storedResponse,
      replayed: true,
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/public/orders',
      headers: headers(),
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['idempotency-replayed']).toBe('true');
    expect(res.json()).toEqual(storedResponse);
    expect(emit).not.toHaveBeenCalled();
    await app.close();
  });

  it('answers PRICE_CHANGED with a fresh quote inline', async () => {
    const { app } = await harness(async () => {
      throw new PriceChanged({
        lines: [
          {
            clientLineId: IDEMPOTENCY,
            menuItemId: IDEMPOTENCY,
            qty: 1,
            unitPriceMinor: 9500 as never,
            modifierTotalMinor: 0 as never,
            lineTotalMinor: 9500 as never,
            modifiers: [],
          },
        ],
        subtotalMinor: 9500 as never,
        discountMinor: 0 as never,
        totalMinor: 9500 as never,
        unavailable: [],
        etaItems: [{ prepSeconds: 60 }],
      });
    });
    const res = await app.inject({
      method: 'POST',
      url: '/public/orders',
      headers: headers(),
      payload,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('PRICE_CHANGED');
    expect(res.json().quote.totalMinor).toBe(9500);
    expect(res.json().quote.eta).toBeDefined();
    await app.close();
  });

  it('returns the existing order with OPEN_ORDER_LIMIT', async () => {
    const { app } = await harness(async () => {
      throw new OpenOrderLimit({ orderId: 'o9', orderNumber: 'A-041', status: 'ready' });
    });
    const res = await app.inject({
      method: 'POST',
      url: '/public/orders',
      headers: headers(),
      payload,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      code: 'OPEN_ORDER_LIMIT',
      existingOrder: { orderNumber: 'A-041', status: 'ready' },
    });
    await app.close();
  });

  it('rejects a missing idempotency key', async () => {
    const { app } = await harness(async () => {
      throw new Error('should not reach the use case');
    });
    const rest = { authorization: `Bearer ${token()}`, 'content-type': 'application/json' };
    const res = await app.inject({ method: 'POST', url: '/public/orders', headers: rest, payload });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
