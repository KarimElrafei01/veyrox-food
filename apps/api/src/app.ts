import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { problemHandler } from './shared/http/problem-details.js';
import { healthRoutes } from './routes/health.js';
import { customerSessionController } from './contexts/ordering/interface/customer-session-controller.js';
import type { ResolveCustomerSession } from './contexts/ordering/application/resolve-customer-session.js';
import {
  whatsappWebhookController,
  type InboundEventStore,
  type InboundJobQueue,
} from './contexts/messaging/interface/whatsapp-webhook-controller.js';
import { publicCatalogueController } from './contexts/catalog/interface/public-catalogue-controller.js';
import type { CatalogueRepository } from './contexts/catalog/infrastructure/catalogue-repository.js';
import { quoteOrderController } from './contexts/ordering/interface/quote-order-controller.js';
import type { QuoteOrder } from './contexts/ordering/application/quote-order.js';
import type { EtaQueueRepository } from './contexts/ordering/infrastructure/eta-queue-repository.js';
import type { EtaMetricSink } from './contexts/ordering/application/eta-metrics.js';
import { placeOrderController } from './contexts/ordering/interface/place-order-controller.js';
import type { PlaceOrder } from './contexts/ordering/application/place-order.js';
import { customerLocaleController } from './contexts/ordering/interface/customer-locale-controller.js';
import type { CustomerLocaleRepository } from './contexts/ordering/infrastructure/customer-locale-repository.js';
import type { OrderPlacementMetricSink } from './contexts/ordering/application/order-placement-metrics.js';
import { orderStatusController } from './contexts/ordering/interface/order-status-controller.js';
import type { OrderStatusRepository } from './contexts/ordering/infrastructure/order-status-repository.js';

export interface AppDeps {
  pingPostgres: () => Promise<boolean>;
  pingRedis: () => Promise<boolean>;
  customerSession?: { resolver: ResolveCustomerSession; keys: readonly [string, ...string[]] };
  whatsappWebhook?: { appSecret: string; events: InboundEventStore; queue: InboundJobQueue };
  catalogue?: {
    repository: CatalogueRepository;
    availabilityCache: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
    };
    sessionKeys: readonly [string, ...string[]];
  };
  quoteOrder?: {
    quote: QuoteOrder;
    keys: readonly [string, ...string[]];
    etaQueue: EtaQueueRepository;
    etaMetrics: EtaMetricSink;
  };
  placeOrder?: {
    place: PlaceOrder;
    resolver: ResolveCustomerSession;
    keys: readonly [string, ...string[]];
    etaQueue: EtaQueueRepository;
    metrics: OrderPlacementMetricSink;
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  };
  customerLocale?: {
    repository: CustomerLocaleRepository;
    keys: readonly [string, ...string[]];
  };
  orderStatus?: { orders: OrderStatusRepository; keys: readonly [string, ...string[]] };
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

/**
 * The single write path (T1). One Fastify app, schema-first with Zod so validation,
 * types, and the OpenAPI document come from one declaration (ADR-0001).
 * Dependencies are injected so tests run the real routes without a database.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(problemHandler);
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).type('application/problem+json').send({
      type: 'about:blank',
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
      traceId: request.id,
    });
  });
  app.decorate('deps', deps);

  await app.register(helmet);
  if (deps.whatsappWebhook) {
    const webhook = deps.whatsappWebhook;
    // Encapsulated so the raw-buffer parser stays on `/webhooks/whatsapp` only —
    // the signature is over the exact bytes (F1.1), but every other JSON route
    // needs the parsed object for its Zod body schema.
    await app.register(async (scope) => {
      scope.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_request, body, done) => {
          done(null, body);
        },
      );
      await scope.register(whatsappWebhookController, webhook);
    });
  }
  await app.register(healthRoutes);
  if (deps.customerSession) await app.register(customerSessionController, deps.customerSession);
  if (deps.customerLocale) await app.register(customerLocaleController, deps.customerLocale);
  if (deps.catalogue) {
    await app.register(publicCatalogueController, {
      catalogue: deps.catalogue.repository,
      availabilityCache: deps.catalogue.availabilityCache,
      sessionKeys: deps.catalogue.sessionKeys,
    });
  }
  if (deps.quoteOrder) await app.register(quoteOrderController, deps.quoteOrder);
  if (deps.placeOrder) await app.register(placeOrderController, deps.placeOrder);
  if (deps.orderStatus) await app.register(orderStatusController, deps.orderStatus);

  return app;
}
