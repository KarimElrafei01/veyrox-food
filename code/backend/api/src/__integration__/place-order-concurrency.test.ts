import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { provisionTestDatabase, type TestDatabase } from '@veyroxai/testkit';
import { createDatabase, createPool, runMigrations } from '@veyroxai/db';
import { toMinor } from '@veyroxai/domain';
import { buildApp } from '../app.js';
import { PlaceOrder } from '../contexts/ordering/application/place-order.js';
import type { EtaMetricSink } from '../contexts/ordering/application/eta-metrics.js';
import type { OrderPlacementMetricSink } from '../contexts/ordering/application/order-placement-metrics.js';
import { OrderPlacementRepository } from '../contexts/ordering/infrastructure/order-placement-repository.js';
import { EtaQueueRepository } from '../contexts/ordering/infrastructure/eta-queue-repository.js';
import type { ResolveCustomerSession } from '../contexts/ordering/application/resolve-customer-session.js';
import type { QuoteOrder } from '../contexts/ordering/application/quote-order.js';
import type { PricedForQuote } from '../contexts/ordering/interface/quote-body.js';
import { mintCustomerSession } from '../contexts/identity/domain/index.js';
import { createMemoryRedis } from '../dev/memory-redis.js';
import { seedOrderableTenant } from './seed.js';

const SESSION_KEY = 'integration-test-key';
const CONCURRENCY = 10;

/**
 * The concurrency bug this guards against: OrderPlacementRepository.place()
 * finds an existing order for the idempotency key *after* acquiring the
 * advisory lock (the race window between findReplay() and the lock, which ten
 * simultaneous requests all fall into), but used to return it indistinguishably
 * from a fresh placement. PlaceOrder then always reported `replayed: false`,
 * so the controller answered every one of the ten with 201, incremented
 * orders_placed_total ten times, and emitted OrderPlaced ten times — for one
 * underlying order. A real KDS ticket, a real WhatsApp confirmation, or any
 * other OrderPlaced subscriber would have fired nine extra times per customer.
 */
describe('POST /public/orders — ten concurrent requests, one idempotency key', () => {
  let harness: TestDatabase;
  let pool: Pool;
  // Storage-side assertions (order/event row counts) read back with the admin
  // role: RLS on the app role only applies inside a `withTenant` transaction that
  // sets `app.tenant_id`, which a bare verification query doesn't do.
  let adminPool: Pool;
  let seed: Awaited<ReturnType<typeof seedOrderableTenant>>;

  beforeAll(async () => {
    harness = await provisionTestDatabase();
    await runMigrations(harness.adminUrl);
    adminPool = new Pool({ connectionString: harness.adminUrl });
    seed = await seedOrderableTenant(adminPool, 'concurrency');
    pool = createPool(harness.appUrl);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool?.end();
    await harness?.drop();
  });

  it('places once (201) and replays the rest (200, no duplicate side effects)', async () => {
    const database = createDatabase(pool);
    const etaMetrics: EtaMetricSink = { increment: vi.fn(), gauge: vi.fn() };
    const etaQueue = new EtaQueueRepository(database, createMemoryRedis());

    const pricedCart: PricedForQuote = {
      lines: [
        {
          clientLineId: seed.itemId,
          menuItemId: seed.itemId,
          qty: 1,
          unitPriceMinor: toMinor(seed.priceMinor),
          modifierTotalMinor: toMinor(0),
          lineTotalMinor: toMinor(seed.priceMinor),
          modifiers: [],
        },
      ],
      subtotalMinor: toMinor(seed.priceMinor),
      discountMinor: toMinor(0),
      totalMinor: toMinor(seed.priceMinor),
      unavailable: [],
      etaItems: [{ prepSeconds: seed.prepSeconds }],
    };
    const quote = { execute: vi.fn(async () => pricedCart) } as unknown as QuoteOrder;

    const place = new PlaceOrder(
      quote,
      new OrderPlacementRepository(database),
      etaQueue,
      etaMetrics,
    );
    const resolver = {
      execute: vi.fn(async () => ({
        customer: { tier: 'bronze' as const },
        ordering: { minOrderValueMinor: 0 },
      })),
    } as unknown as ResolveCustomerSession;
    const metrics: OrderPlacementMetricSink = { increment: vi.fn(), observe: vi.fn() };
    const emit = vi.fn(async () => {});

    const app = await buildApp({
      pingPostgres: async () => true,
      pingRedis: async () => true,
      placeOrder: { place, resolver, keys: [SESSION_KEY], etaQueue, etaMetrics, metrics, emit },
    });

    const iat = Math.floor(Date.now() / 1000);
    const token = mintCustomerSession(
      {
        tenantId: seed.tenantId,
        customerId: seed.customerId,
        waId: 'wa-concurrency',
        menuVersionId: seed.menuVersionId,
        tier: 'bronze',
        locale: 'en',
        issuedAt: iat,
        expiresAt: iat + 3600,
      },
      SESSION_KEY,
    );
    const idempotencyKey = randomUUID();
    const payload = JSON.stringify({
      items: [
        { clientLineId: seed.itemId, menuItemId: seed.itemId, qty: 1, modifierOptionIds: [] },
      ],
    });

    try {
      const responses = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          app.inject({
            method: 'POST',
            url: '/public/orders',
            headers: {
              authorization: `Bearer ${token}`,
              'idempotency-key': idempotencyKey,
              'content-type': 'application/json',
            },
            payload,
          }),
        ),
      );

      const created = responses.filter((r) => r.statusCode === 201);
      const replayed = responses.filter((r) => r.statusCode === 200);
      expect(created).toHaveLength(1);
      expect(replayed).toHaveLength(CONCURRENCY - 1);
      for (const r of replayed) {
        expect(r.headers['idempotency-replayed']).toBe('true');
      }
      // Every response — the original 201 and every 200 replay — carries the same
      // stored order data (F1.6 §5). Compared parsed, not as raw bytes: Postgres
      // jsonb doesn't guarantee to preserve key order on round-trip, so the 200s
      // (read back from `placement_response`) can legitimately serialize with a
      // different key order than the 201's in-memory object, despite equal content.
      const parsedBodies = responses.map((r) => JSON.parse(r.body));
      for (const body of parsedBodies) {
        expect(body).toEqual(parsedBodies[0]);
      }

      const orderRows = await adminPool.query(
        'select id from orders where tenant_id = $1 and idempotency_key = $2',
        [seed.tenantId, idempotencyKey],
      );
      expect(orderRows.rows).toHaveLength(1);
      const orderId: string = orderRows.rows[0].id;

      const eventRows = await adminPool.query('select id from order_events where order_id = $1', [
        orderId,
      ]);
      expect(eventRows.rows).toHaveLength(1);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith({ orderId, tenantId: seed.tenantId });

      const placedCalls = (metrics.increment as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([name]) => name === 'orders_placed_total',
      );
      const replayCalls = (metrics.increment as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([name]) => name === 'idempotency_replay_total',
      );
      expect(placedCalls).toHaveLength(1);
      expect(replayCalls).toHaveLength(CONCURRENCY - 1);
    } finally {
      await app.close();
    }
  });
});
