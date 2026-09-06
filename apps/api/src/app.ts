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
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });
    await app.register(whatsappWebhookController, deps.whatsappWebhook);
  }
  await app.register(healthRoutes);
  if (deps.customerSession) await app.register(customerSessionController, deps.customerSession);
  if (deps.catalogue) {
    await app.register(publicCatalogueController, {
      catalogue: deps.catalogue.repository,
      availabilityCache: deps.catalogue.availabilityCache,
      sessionKeys: deps.catalogue.sessionKeys,
    });
  }
  if (deps.quoteOrder) await app.register(quoteOrderController, deps.quoteOrder);

  return app;
}
