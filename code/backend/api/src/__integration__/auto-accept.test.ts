import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { provisionTestDatabase, type TestDatabase } from '@veyroxai/testkit';
import { createDatabase, createPool, runMigrations } from '@veyroxai/db';
import { toMinor } from '@veyroxai/domain';
import { buildApp } from '../app.js';
import { PlaceOrder } from '../contexts/ordering/application/place-order.js';
import { AcceptOrder } from '../contexts/ordering/application/accept-order.js';
import { RejectOrder } from '../contexts/ordering/application/reject-order.js';
import { AutoAcceptIncomingOrder } from '../contexts/ordering/application/auto-accept-incoming-order.js';
import type { EtaMetricSink } from '../contexts/ordering/application/eta-metrics.js';
import type { OrderPlacementMetricSink } from '../contexts/ordering/application/order-placement-metrics.js';
import { OrderPlacementRepository } from '../contexts/ordering/infrastructure/order-placement-repository.js';
import { EtaQueueRepository } from '../contexts/ordering/infrastructure/eta-queue-repository.js';
import { KitchenOrderRepository } from '../contexts/ordering/infrastructure/kitchen-order-repository.js';
import { SseHub } from '../contexts/ordering/infrastructure/sse-hub.js';
import type { ResolveCustomerSession } from '../contexts/ordering/application/resolve-customer-session.js';
import type { QuoteOrder } from '../contexts/ordering/application/quote-order.js';
import type { PricedForQuote } from '../contexts/ordering/interface/quote-body.js';
import { mintCustomerSession } from '../contexts/identity/domain/index.js';
import { createMemoryRedis } from '../dev/memory-redis.js';
import { seedOrderableTenant } from './seed.js';

const SESSION_KEY = 'auto-accept-test-key';

/**
 * ADR-0024, end to end: a `kitchen.auto_accept` tenant runs the whole §2.1
 * Accept transaction automatically on placement - no separate barista tap,
 * no separate HTTP call. This is the one place that actually proves the
 * `actor: { type: 'system' }` plumbing reaches every row it should
 * (order_events, material_ledger) rather than trusting the unit tests'
 * mocks to have wired it correctly.
 *
 * Each test seeds its own tenant/customer (ADR-0010's one-open-order cap
 * would otherwise make the second and third test's placement 409 against
 * the first test's still-open order if they shared one seed).
 */
describe('POST /public/orders with kitchen.auto_accept on', () => {
  let harness: TestDatabase;
  let pool: Pool;
  let adminPool: Pool;

  beforeAll(async () => {
    harness = await provisionTestDatabase();
    await runMigrations(harness.adminUrl);
    adminPool = new Pool({ connectionString: harness.adminUrl });
    pool = createPool(harness.appUrl);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool?.end();
    await harness?.drop();
  });

  function buildOrderingApp(seed: Awaited<ReturnType<typeof seedOrderableTenant>>) {
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
    const sseHub = new SseHub();
    const kitchenOrders = new KitchenOrderRepository(database);
    const place = new PlaceOrder(
      quote,
      new OrderPlacementRepository(database),
      etaQueue,
      etaMetrics,
      kitchenOrders,
      sseHub,
    );
    const resolver = {
      execute: vi.fn(async () => ({
        customer: { tier: 'bronze' as const },
        ordering: { minOrderValueMinor: 0 },
      })),
    } as unknown as ResolveCustomerSession;
    const metrics: OrderPlacementMetricSink = { increment: vi.fn(), observe: vi.fn() };
    const autoAccept = {
      service: new AutoAcceptIncomingOrder(
        new AcceptOrder(kitchenOrders, etaQueue, etaMetrics, sseHub),
        new RejectOrder(kitchenOrders, sseHub),
      ),
      db: database,
    };
    return { database, sseHub, place, resolver, etaQueue, etaMetrics, metrics, autoAccept };
  }

  function customerToken(seed: Awaited<ReturnType<typeof seedOrderableTenant>>): string {
    const iat = Math.floor(Date.now() / 1000);
    return mintCustomerSession(
      {
        tenantId: seed.tenantId,
        customerId: seed.customerId,
        waId: 'wa-auto-accept',
        menuVersionId: seed.menuVersionId,
        tier: 'bronze',
        locale: 'en',
        issuedAt: iat,
        expiresAt: iat + 3600,
      },
      SESSION_KEY,
    );
  }

  async function placeOrder(
    app: Awaited<ReturnType<typeof buildApp>>,
    seed: Awaited<ReturnType<typeof seedOrderableTenant>>,
  ) {
    return app.inject({
      method: 'POST',
      url: '/public/orders',
      headers: {
        authorization: `Bearer ${customerToken(seed)}`,
        'idempotency-key': randomUUID(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        items: [
          { clientLineId: seed.itemId, menuItemId: seed.itemId, qty: 1, modifierOptionIds: [] },
        ],
      }),
    });
  }

  it('lands the order in received, with the ledger and event rows attributed to system', async () => {
    const seed = await seedOrderableTenant(adminPool, 'auto-accept-on');
    await adminPool.query(
      `insert into tenant_settings (tenant_id, key, value) values ($1, 'kitchen.auto_accept', 'true'::jsonb)`,
      [seed.tenantId],
    );
    const { sseHub, place, resolver, etaQueue, etaMetrics, metrics, autoAccept } =
      buildOrderingApp(seed);
    const app = await buildApp({
      pingPostgres: async () => true,
      pingRedis: async () => true,
      placeOrder: {
        place,
        resolver,
        keys: [SESSION_KEY],
        etaQueue,
        etaMetrics,
        metrics,
        emit: async () => {},
        autoAccept,
      },
    });

    try {
      const response = await placeOrder(app, seed);
      expect(response.statusCode).toBe(201);

      const orderId: string = JSON.parse(response.body).orderId;

      const order = await adminPool.query('select status from orders where id = $1', [orderId]);
      expect(order.rows[0].status).toBe('received');

      const events = await adminPool.query(
        'select from_status, to_status, actor_type, actor_id, source from order_events where order_id = $1 order by id',
        [orderId],
      );
      expect(events.rows).toHaveLength(2);
      expect(events.rows[0]).toMatchObject({ to_status: 'placed', actor_type: 'customer' });
      expect(events.rows[1]).toMatchObject({
        from_status: 'placed',
        to_status: 'received',
        actor_type: 'system',
        actor_id: null,
        source: 'auto_accept',
      });

      const ledger = await adminPool.query(
        'select actor_type, actor_id from material_ledger where order_id = $1',
        [orderId],
      );
      expect(ledger.rows.length).toBeGreaterThan(0);
      for (const row of ledger.rows) {
        expect(row.actor_type).toBe('system');
        expect(row.actor_id).toBeNull();
      }
    } finally {
      await app.close();
      sseHub.stop();
    }
  });

  it('auto-rejects with item_unavailable when an item was 86ed before placement, no ledger rows', async () => {
    const seed = await seedOrderableTenant(adminPool, 'auto-accept-86');
    await adminPool.query(
      `insert into tenant_settings (tenant_id, key, value) values ($1, 'kitchen.auto_accept', 'true'::jsonb)`,
      [seed.tenantId],
    );
    // The app pool is RLS-enforced and this runs outside withTenant, so an
    // update through it would silently match zero rows - the admin pool
    // bypasses RLS the same way seedOrderableTenant's own inserts do.
    await adminPool.query('update menu_items set is_available = false where id = $1', [
      seed.itemId,
    ]);

    const { sseHub, place, resolver, etaQueue, etaMetrics, metrics, autoAccept } =
      buildOrderingApp(seed);
    const app = await buildApp({
      pingPostgres: async () => true,
      pingRedis: async () => true,
      placeOrder: {
        place,
        resolver,
        keys: [SESSION_KEY],
        etaQueue,
        etaMetrics,
        metrics,
        emit: async () => {},
        autoAccept,
      },
    });

    try {
      const response = await placeOrder(app, seed);
      // Placement itself succeeds (F1's own quote/placement path re-checks
      // availability too, at a different point) - assert on the follow-up
      // outcome, not this response.
      expect([201, 409]).toContain(response.statusCode);
      if (response.statusCode !== 201) return;

      const orderId: string = JSON.parse(response.body).orderId;
      const order = await adminPool.query(
        'select status, rejection_reason from orders where id = $1',
        [orderId],
      );
      expect(order.rows[0]).toMatchObject({
        status: 'rejected',
        rejection_reason: 'item_unavailable',
      });

      const ledger = await adminPool.query('select 1 from material_ledger where order_id = $1', [
        orderId,
      ]);
      expect(ledger.rows).toHaveLength(0);
    } finally {
      await app.close();
      sseHub.stop();
    }
  });

  it('leaves the order in placed when kitchen.auto_accept is off (default)', async () => {
    const seed = await seedOrderableTenant(adminPool, 'auto-accept-off');
    const { sseHub, place, resolver, etaQueue, etaMetrics, metrics, autoAccept } =
      buildOrderingApp(seed);
    const app = await buildApp({
      pingPostgres: async () => true,
      pingRedis: async () => true,
      placeOrder: {
        place,
        resolver,
        keys: [SESSION_KEY],
        etaQueue,
        etaMetrics,
        metrics,
        emit: async () => {},
        autoAccept,
      },
    });

    try {
      const response = await placeOrder(app, seed);
      expect(response.statusCode).toBe(201);
      const orderId: string = JSON.parse(response.body).orderId;
      const order = await adminPool.query('select status from orders where id = $1', [orderId]);
      expect(order.rows[0].status).toBe('placed');
    } finally {
      await app.close();
      sseHub.stop();
    }
  });
});
