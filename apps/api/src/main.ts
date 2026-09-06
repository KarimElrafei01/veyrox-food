import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { createDatabase, createPool } from '@veyroxai/db';
import { createLogger } from '@veyroxai/observability';
import { buildApp } from './app.js';
import { ResolveCustomerSession } from './contexts/ordering/application/resolve-customer-session.js';
import { CustomerSessionRepository } from './contexts/ordering/infrastructure/customer-session-repository.js';
import { InboundEventRepository } from './contexts/messaging/infrastructure/inbound-event-repository.js';
import { CatalogueRepository } from './contexts/catalog/infrastructure/catalogue-repository.js';
import { QuoteOrder } from './contexts/ordering/application/quote-order.js';
import { PublishedMenuRepository } from './contexts/ordering/infrastructure/published-menu-repository.js';
import { EtaQueueRepository } from './contexts/ordering/infrastructure/eta-queue-repository.js';
import { PlaceOrder } from './contexts/ordering/application/place-order.js';
import { OrderPlacementRepository } from './contexts/ordering/infrastructure/order-placement-repository.js';
import { CustomerLocaleRepository } from './contexts/ordering/infrastructure/customer-locale-repository.js';
import type { OrderPlacementMetricSink } from './contexts/ordering/application/order-placement-metrics.js';
import { OrderStatusRepository } from './contexts/ordering/infrastructure/order-status-repository.js';

const log = createLogger({ service: 'api' });

async function main(): Promise<void> {
  const pool = createPool();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const sessionKey = process.env.SESSION_KEY;
  if (!sessionKey) throw new Error('SESSION_KEY is not set');
  const previousSessionKey = process.env.SESSION_KEY_PREVIOUS;
  const whatsappAppSecret = process.env.WHATSAPP_APP_SECRET;
  if (!whatsappAppSecret) throw new Error('WHATSAPP_APP_SECRET is not set');
  const database = createDatabase(pool);
  const queue = new Queue('veyrox', { connection: redis });
  const sessionKeys: [string, ...string[]] = previousSessionKey
    ? [sessionKey, previousSessionKey]
    : [sessionKey];
  const publishedMenus = new PublishedMenuRepository(database, redis);
  const quoteOrder = new QuoteOrder(publishedMenus);
  const etaQueue = new EtaQueueRepository(database, redis);
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
    },
    quoteOrder: {
      quote: quoteOrder,
      keys: sessionKeys,
      etaQueue,
      etaMetrics: {
        increment: (name) => log.info('eta metric increment', { name }),
        gauge: (name, value) => log.info('eta metric gauge', { name, value }),
      },
    },
    placeOrder: {
      place: new PlaceOrder(quoteOrder, new OrderPlacementRepository(database)),
      resolver: new ResolveCustomerSession(new CustomerSessionRepository(database)),
      keys: sessionKeys,
      etaQueue,
      metrics: placementMetrics,
      emit: async (event) => {
        log.info('OrderPlaced', event);
      },
    },
    orderStatus: {
      orders: new OrderStatusRepository(database),
      keys: sessionKeys,
    },
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
