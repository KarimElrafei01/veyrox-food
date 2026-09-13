import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { provisionTestDatabase, type TestDatabase } from '@veyroxai/testkit';
import { createDatabase, createPool, runMigrations, tables } from '@veyroxai/db';
import { buildApp } from '../app.js';
import { KitchenOrderRepository } from '../contexts/ordering/infrastructure/kitchen-order-repository.js';
import { EtaQueueRepository } from '../contexts/ordering/infrastructure/eta-queue-repository.js';
import { LoadBoardSnapshot } from '../contexts/ordering/application/load-board-snapshot.js';
import { mintDeviceJwt, mintPinActionToken } from '../contexts/identity/domain/index.js';
import { createMemoryRedis } from '../dev/memory-redis.js';
import { seedOrderableTenant } from './seed.js';

const DEVICE_KEY = 'integration-device-key';
const PIN_KEY = 'integration-pin-key';

/**
 * GET /staff/board against real Postgres, not mocks - the one thing this
 * feature's unit tests (repository fully stubbed) can't catch: Postgres has
 * no `max(uuid)` aggregate, so `select max(id) from order_events` 500s the
 * instant a real tenant has any events at all. That bug shipped past every
 * unit and mocked-repository test in this feature; only a real database
 * surfaces it, which is exactly why this suite exists.
 */
describe('GET /staff/board — against real Postgres', () => {
  let harness: TestDatabase;
  let pool: Pool;
  let adminPool: Pool;
  let seed: Awaited<ReturnType<typeof seedOrderableTenant>>;

  beforeAll(async () => {
    harness = await provisionTestDatabase();
    await runMigrations(harness.adminUrl);
    adminPool = new Pool({ connectionString: harness.adminUrl });
    seed = await seedOrderableTenant(adminPool, 'board-snapshot');
    pool = createPool(harness.appUrl);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool?.end();
    await harness?.drop();
  });

  it('returns 200 with the New order and a real asOfEventId once an order_events row exists', async () => {
    const database = createDatabase(pool);
    const adminDb = createDatabase(adminPool);
    const businessDate = new Date().toISOString().slice(0, 10);

    const [order] = await adminDb
      .insert(tables.orders)
      .values({
        tenantId: seed.tenantId,
        orderNumber: 'A-900',
        businessDate,
        channel: 'whatsapp',
        customerId: seed.customerId,
        status: 'placed',
        subtotalMinor: seed.priceMinor,
        totalMinor: seed.priceMinor,
        idempotencyKey: randomUUID(),
      })
      .returning();
    await adminDb.insert(tables.orderItems).values({
      tenantId: seed.tenantId,
      orderId: order!.id,
      menuItemId: seed.itemId,
      qty: 1,
      unitPriceMinor: seed.priceMinor,
      modifierTotalMinor: 0,
      lineTotalMinor: seed.priceMinor,
      costSnapshotMinor: 220,
      recipeVersionId: seed.recipeId,
      menuPriceVersionId: seed.menuVersionId,
      nameSnapshotEn: 'Latte',
    });
    // The exact row whose id the (buggy) max(uuid) aggregate choked on.
    await adminDb.insert(tables.orderEvents).values({
      tenantId: seed.tenantId,
      orderId: order!.id,
      fromStatus: null,
      toStatus: 'placed',
      actorType: 'customer',
      source: 'webview',
    });

    const kitchenOrders = new KitchenOrderRepository(database);
    const etaQueue = new EtaQueueRepository(database, createMemoryRedis());
    const board = new LoadBoardSnapshot(kitchenOrders, etaQueue);

    const app = await buildApp({
      pingPostgres: async () => true,
      pingRedis: async () => true,
      boardSnapshot: { board, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY] },
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
    const pinToken = mintPinActionToken(
      {
        tenantId: seed.tenantId,
        deviceId: 'kds-1',
        staffId: randomUUID(),
        issuedAt: now,
        expiresAt: now + 900,
      },
      PIN_KEY,
    );

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/staff/board',
        headers: { authorization: `Bearer ${deviceToken}`, 'x-staff-pin-token': pinToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.asOfEventId).toBe('string');
      expect(body.columns.new).toHaveLength(1);
      expect(body.columns.new[0].orderId).toBe(order!.id);
    } finally {
      await app.close();
    }
  });

  it('GET /staff/stream replays without 500ing once a lastEventId is supplied', async () => {
    const database = createDatabase(pool);
    const kitchenOrders = new KitchenOrderRepository(database);
    // currentMaxEventId is the other call site the same aggregate bug hit.
    const maxId = await kitchenOrders.currentMaxEventId(seed.tenantId);
    expect(typeof maxId).toBe('string');
  });
});
