import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { createDatabase, createPool } from '@veyroxai/db';
import {
  createMemoryRedis,
  createNoopQueue,
  type DevCache,
  type DevQueue,
} from './dev/memory-redis.js';
import { createLogger } from '@veyroxai/observability';
import { buildApp } from './app.js';
import { ResolveCustomerSession } from './contexts/ordering/application/resolve-customer-session.js';
import { CustomerSessionRepository } from './contexts/ordering/infrastructure/customer-session-repository.js';
import { InboundEventRepository } from './contexts/messaging/infrastructure/inbound-event-repository.js';
import { CatalogueRepository } from './contexts/catalog/infrastructure/catalogue-repository.js';
import { QuoteOrder } from './contexts/ordering/application/quote-order.js';
import { PublishedMenuRepository } from './contexts/ordering/infrastructure/published-menu-repository.js';
import { EtaQueueRepository } from './contexts/ordering/infrastructure/eta-queue-repository.js';
import { createReadPathBudget } from './contexts/ordering/infrastructure/read-path-budget.js';
import { PlaceOrder } from './contexts/ordering/application/place-order.js';
import { OrderPlacementRepository } from './contexts/ordering/infrastructure/order-placement-repository.js';
import { CustomerLocaleRepository } from './contexts/ordering/infrastructure/customer-locale-repository.js';
import type { OrderPlacementMetricSink } from './contexts/ordering/application/order-placement-metrics.js';
import type { EtaMetricSink } from './contexts/ordering/application/eta-metrics.js';
import { OrderStatusRepository } from './contexts/ordering/infrastructure/order-status-repository.js';
import { R2MenuImageStore } from './contexts/catalog/infrastructure/r2-menu-image-store.js';

const log = createLogger({ service: 'api' });

async function main(): Promise<void> {
  const pool = createPool();
  // `REDIS_URL=memory` swaps in an in-process cache + no-op queue for local dev on
  // a machine without Redis (dev/memory-redis.ts). Never in production.
  const memoryRedis = (process.env.REDIS_URL ?? '').toLowerCase() === 'memory';
  if (memoryRedis && process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL=memory is a dev-only shim; set a real Redis URL.');
  }
  const redis: Redis | DevCache = memoryRedis
    ? createMemoryRedis()
    : new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
  const sessionKey = process.env.SESSION_KEY;
  if (!sessionKey) throw new Error('SESSION_KEY is not set');
  const previousSessionKey = process.env.SESSION_KEY_PREVIOUS;
  const whatsappAppSecret = process.env.WHATSAPP_APP_SECRET;
  if (!whatsappAppSecret) throw new Error('WHATSAPP_APP_SECRET is not set');
  const database = createDatabase(pool);
  const devLogin = ['1', 'true', 'yes'].includes((process.env.DEV_LOGIN ?? '').toLowerCase());
  const devAdminUrl = process.env.DATABASE_ADMIN_URL;
  if (devLogin) {
    if (!devAdminUrl)
      throw new Error(
        'DEV_LOGIN requires DATABASE_ADMIN_URL (it lists every tenant, which RLS hides from the app role).',
      );
    log.warn(
      'DEV_LOGIN is on: GET /dev/sessions mints a session token for every customer. Never enable this against real tenant data.',
    );
  }
  // The dev picker lists every tenant/customer, which RLS hides from the app role,
  // so it runs on the BYPASSRLS admin connection (same as the fixture script).
  const devDatabase = devLogin && devAdminUrl ? createDatabase(createPool(devAdminUrl)) : null;
  const queue: Queue | DevQueue = memoryRedis
    ? createNoopQueue()
    : new Queue('veyrox', { connection: redis as Redis });
  const sessionKeys: [string, ...string[]] = previousSessionKey
    ? [sessionKey, previousSessionKey]
    : [sessionKey];
  // Shared floor, not a ceiling: quote + ETA rebuilds may never claim more than
  // this many of the pool's 20 connections, so order placement is never left
  // fighting a read-side stampede for a connection (never routed through this
  // budget itself, so it is never capped by it).
  const readPathBudget = createReadPathBudget(16);
  const publishedMenus = new PublishedMenuRepository(database, redis, readPathBudget);
  const imageStore =
    process.env.R2_BUCKET &&
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
      ? new R2MenuImageStore(process.env.R2_BUCKET, {
          endpoint: process.env.R2_ENDPOINT,
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        })
      : undefined;
  const quoteOrder = new QuoteOrder(publishedMenus);
  const etaQueue = new EtaQueueRepository(database, redis, readPathBudget);
  // Shared by the quote and placement paths so a degraded (no-cache, or Postgres-down)
  // ETA read is one signal regardless of which endpoint hit it.
  const etaMetrics: EtaMetricSink = {
    increment: (name) => log.info('eta metric increment', { name }),
    gauge: (name, value) => log.info('eta metric gauge', { name, value }),
  };
  const placementMetrics: OrderPlacementMetricSink = {
    increment: (name, labels) => log.info('order placement metric', { name, ...labels }),
    observe: (name, seconds) => log.info('order placement metric', { name, seconds }),
  };

  const app = await buildApp({
    pingPostgres: async () => {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    pingRedis: async () => {
      try {
        if (redis.status === 'wait') {
          await redis.connect();
        }
        return (await redis.ping()) === 'PONG';
      } catch {
        return false;
      }
    },
    customerSession: {
      resolver: new ResolveCustomerSession(new CustomerSessionRepository(database)),
      keys: previousSessionKey ? [sessionKey, previousSessionKey] : [sessionKey],
    },
    customerLocale: {
      repository: new CustomerLocaleRepository(database),
      keys: previousSessionKey ? [sessionKey, previousSessionKey] : [sessionKey],
    },
    whatsappWebhook: {
      appSecret: whatsappAppSecret,
      events: new InboundEventRepository(database),
      queue: {
        enqueue: async ({ providerMessageId }) => {
          await queue.add('whatsapp.inbound', { providerMessageId }, { jobId: providerMessageId });
        },
      },
    },
    catalogue: {
      repository: new CatalogueRepository(database),
      availabilityCache: redis,
      sessionKeys: previousSessionKey ? [sessionKey, previousSessionKey] : [sessionKey],
      imageStore,
    },
    quoteOrder: {
      quote: quoteOrder,
      keys: sessionKeys,
      etaQueue,
      etaMetrics,
    },
    placeOrder: {
      place: new PlaceOrder(
        quoteOrder,
        new OrderPlacementRepository(database),
        etaQueue,
        etaMetrics,
      ),
      resolver: new ResolveCustomerSession(new CustomerSessionRepository(database)),
      keys: sessionKeys,
      etaQueue,
      etaMetrics,
      metrics: placementMetrics,
      emit: async (event) => {
        log.info('OrderPlaced', event);
      },
    },
    orderStatus: {
      orders: new OrderStatusRepository(database),
      keys: sessionKeys,
      etaQueue,
      etaMetrics,
    },
    devSessions: devDatabase
      ? { db: devDatabase, sessionKey, catalogue: new CatalogueRepository(devDatabase) }
      : undefined,
    // Regular (RLS-scoped) database — this always knows the caller's tenantId, so
    // it doesn't need the BYPASSRLS admin connection devSessions does.
    devKitchen: devLogin ? { db: database, etaQueue } : undefined,
  });

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void (async () => {
        await app.close();
        await queue.close();
        await pool.end();
        redis.disconnect();
        process.exit(0);
      })();
    });
  }

  await app.listen({ port, host });
  log.info('api listening', { port, host });
}

main().catch((err: unknown) => {
  log.error('api failed to start', { err: String(err) });
  process.exit(1);
});
