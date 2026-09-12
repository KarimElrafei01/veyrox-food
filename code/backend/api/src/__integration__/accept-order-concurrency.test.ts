import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { provisionTestDatabase, type TestDatabase } from '@veyroxai/testkit';
import { createDatabase, createPool, runMigrations, tables } from '@veyroxai/db';
import { buildApp } from '../app.js';
import { AcceptOrder } from '../contexts/ordering/application/accept-order.js';
import { KitchenOrderRepository } from '../contexts/ordering/infrastructure/kitchen-order-repository.js';
import { EtaQueueRepository } from '../contexts/ordering/infrastructure/eta-queue-repository.js';
import { SseHub } from '../contexts/ordering/infrastructure/sse-hub.js';
import type { EtaMetricSink } from '../contexts/ordering/application/eta-metrics.js';
import { mintDeviceJwt, mintPinActionToken } from '../contexts/identity/domain/index.js';
import { createMemoryRedis } from '../dev/memory-redis.js';
import { seedOrderableTenant } from './seed.js';

const DEVICE_KEY = 'integration-device-key';
const PIN_KEY = 'integration-pin-key';
const CONCURRENCY = 10;

/**
 * Backend doc §2.2's named failure mode, made concrete: two concurrent Accept
 * requests carrying the same Idempotency-Key both read status='placed' before
 * either commits, both pass the guard, and (if the unique index on
 * (tenant_id, idempotency_key) in order_events didn't close the race) both
 * insert a full set of sale_deduction ledger rows - milk deducted twice for
 * one drink, silently and permanently. This is the one mutation in the whole
 * KDS feature where getting idempotency wrong has a directly measurable
 * financial consequence, which is why it gets its own concurrent-request
 * integration test rather than relying on the sequential unit tests alone.
 */
describe('POST /orders/:id/accept — ten concurrent requests, one idempotency key', () => {
  let harness: TestDatabase;
  let pool: Pool;
  let adminPool: Pool;
  let seed: Awaited<ReturnType<typeof seedOrderableTenant>>;

  beforeAll(async () => {
    harness = await provisionTestDatabase();
    await runMigrations(harness.adminUrl);
    adminPool = new Pool({ connectionString: harness.adminUrl });
    seed = await seedOrderableTenant(adminPool, 'accept-concurrency');
    pool = createPool(harness.appUrl);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool?.end();
    await harness?.drop();
  });

  it('deducts materials exactly once (201/200 split by Idempotency-Replayed, not status)', async () => {
    const database = createDatabase(pool);
    const adminDb = createDatabase(adminPool);

    // A WhatsApp order already sitting in New, ready for a barista to Accept -
    // inserted directly rather than through the full placement flow, since
    // this test is about Accept's concurrency, not placement's.
    const businessDate = new Date().toISOString().slice(0, 10);
    const [order] = await adminDb
      .insert(tables.orders)
      .values({
        tenantId: seed.tenantId,
        orderNumber: 'A-001',
        businessDate,
        channel: 'whatsapp',
        customerId: seed.customerId,
        status: 'placed',
        subtotalMinor: seed.priceMinor,
        totalMinor: seed.priceMinor,
        idempotencyKey: randomUUID(),
      })
      .returning();
    const orderId = order!.id;
    await adminDb.insert(tables.orderItems).values({
      tenantId: seed.tenantId,
      orderId,
      menuItemId: seed.itemId,
      qty: 1,
      unitPriceMinor: seed.priceMinor,
      modifierTotalMinor: 0,
      lineTotalMinor: seed.priceMinor,
      costSnapshotMinor: 220, // F1.6 already snapshots this at placement; Accept never touches it
      recipeVersionId: seed.recipeId, // real recipe.id - accept() resolves recipe_lines from this
      menuPriceVersionId: seed.menuVersionId, // not FK-enforced, not read by accept(); any valid uuid
      nameSnapshotEn: 'Latte',
    });

    const etaQueue = new EtaQueueRepository(database, createMemoryRedis());
    const etaMetrics: EtaMetricSink = { increment: () => undefined, gauge: () => undefined };
    const sseHub = new SseHub();
    const accept = new AcceptOrder(
      new KitchenOrderRepository(database),
      etaQueue,
      etaMetrics,
      sseHub,
    );

    const app = await buildApp({
      pingPostgres: async () => true,
      pingRedis: async () => true,
      acceptOrder: {
        accept,
        deviceKeys: [DEVICE_KEY],
        pinKeys: [PIN_KEY],
        emit: async () => undefined,
      },
    });

    const now = Math.floor(Date.now() / 1000);
    const deviceToken = mintDeviceJwt(
      {
        tenantId: seed.tenantId,
        deviceId: 'kds-1',
        deviceKind: 'kds',
        issuedAt: now,
        expiresAt: now + 3600,
      },
      DEVICE_KEY,
    );
    // actor_id on order_events/material_ledger is a real uuid column - staffId
    // flows straight into it, so it must be a real uuid here too, exactly as a
    // real staff row's id would be in production.
    const staffId = randomUUID();
    const pinToken = mintPinActionToken(
      { tenantId: seed.tenantId, deviceId: 'kds-1', staffId, issuedAt: now, expiresAt: now + 900 },
      PIN_KEY,
    );
    const idempotencyKey = randomUUID();

    try {
      const responses = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          app.inject({
            method: 'POST',
            url: `/orders/${orderId}/accept`,
            headers: {
              authorization: `Bearer ${deviceToken}`,
              'x-staff-pin-token': pinToken,
              'content-type': 'application/json',
            },
            payload: JSON.stringify({ idempotencyKey }),
          }),
        ),
      );

      for (const response of responses) expect(response.statusCode).toBe(200);
      const fresh = responses.filter((r) => r.headers['idempotency-replayed'] === 'false');
      const replayed = responses.filter((r) => r.headers['idempotency-replayed'] === 'true');
      expect(fresh).toHaveLength(1);
      expect(replayed).toHaveLength(CONCURRENCY - 1);

      const eventRows = await adminPool.query(
        "select id from order_events where order_id = $1 and to_status = 'received'",
        [orderId],
      );
      expect(eventRows.rows).toHaveLength(1);

      // The actual failure mode this test exists to catch: exactly one
      // sale_deduction row set, never CONCURRENCY sets of them.
      const ledgerRows = await adminPool.query(
        "select id from material_ledger where order_id = $1 and reason = 'sale_deduction'",
        [orderId],
      );
      expect(ledgerRows.rows).toHaveLength(1);

      const orderRow = await adminPool.query('select status from orders where id = $1', [orderId]);
      expect(orderRow.rows[0]?.status).toBe('received');
    } finally {
      await app.close();
      sseHub.stop();
    }
  });
});
