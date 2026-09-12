import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
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
import { staffMenuController } from './contexts/catalog/interface/staff-menu-controller.js';
import type { MenuImageStore } from './contexts/catalog/infrastructure/r2-menu-image-store.js';
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
import { acceptOrderController } from './contexts/ordering/interface/accept-order-controller.js';
import type { AcceptOrder } from './contexts/ordering/application/accept-order.js';
import { rejectOrderController } from './contexts/ordering/interface/reject-order-controller.js';
import type { RejectOrder } from './contexts/ordering/application/reject-order.js';
import { advanceOrderController } from './contexts/ordering/interface/advance-order-controller.js';
import type { AdvanceOrder } from './contexts/ordering/application/advance-order.js';
import { revertOrderController } from './contexts/ordering/interface/revert-order-controller.js';
import type { RevertOrder } from './contexts/ordering/application/revert-order.js';
import { tickItemController } from './contexts/ordering/interface/tick-item-controller.js';
import type { TickItem } from './contexts/ordering/application/tick-item.js';
import { boardSnapshotController } from './contexts/ordering/interface/board-snapshot-controller.js';
import type { LoadBoardSnapshot } from './contexts/ordering/application/load-board-snapshot.js';
import { staffStreamController } from './contexts/ordering/interface/staff-stream-controller.js';
import type { StreamBoardEvents } from './contexts/ordering/application/stream-board.js';
import { setActiveStationsController } from './contexts/ordering/interface/set-active-stations-controller.js';
import type { SetActiveStations } from './contexts/ordering/application/set-active-stations.js';
import { devSessionController } from './dev/dev-session-controller.js';
import { devKitchenController } from './dev/dev-kitchen-controller.js';
import type { Database } from '@veyroxai/db';

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
    imageStore?: MenuImageStore;
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
    etaMetrics: EtaMetricSink;
    metrics: OrderPlacementMetricSink;
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  };
  customerLocale?: {
    repository: CustomerLocaleRepository;
    keys: readonly [string, ...string[]];
  };
  orderStatus?: {
    orders: OrderStatusRepository;
    keys: readonly [string, ...string[]];
    etaQueue: EtaQueueRepository;
    etaMetrics: EtaMetricSink;
  };
  /** Staff realm (ADR-0023): every KDS mutation shares one device/PIN key pair. */
  acceptOrder?: {
    accept: AcceptOrder;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  };
  rejectOrder?: {
    reject: RejectOrder;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  };
  advanceOrder?: {
    advance: AdvanceOrder;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  };
  revertOrder?: {
    revert: RevertOrder;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  };
  tickItem?: {
    tick: TickItem;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  };
  boardSnapshot?: {
    board: LoadBoardSnapshot;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  };
  staffStream?: {
    stream: StreamBoardEvents;
    deviceKeys: readonly [string, ...string[]];
  };
  setActiveStations?: {
    setActiveStations: SetActiveStations;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  };
  staffMenu?: {
    catalogue: CatalogueRepository;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  };
  /** Dev-only session picker (DEV_LOGIN). Off in production. */
  devSessions?: { db: Database; sessionKey: string; catalogue: CatalogueRepository };
  /** Dev-only kitchen-action simulator (DEV_LOGIN). Off in production. */
  devKitchen?: { db: Database; etaQueue: EtaQueueRepository };
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
    // `GET /public/session/:token` carries a signed session token in the path;
    // find-my-way's default cap is 100 characters (F1.1).
    routerOptions: { maxParamLength: 800 },
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

  // The five SPAs are each on their own origin (ADR-0009), so every browser call
  // is cross-origin. CORS_ORIGINS is a comma-separated allow-list; unset reflects
  // any origin (dev only — never leave it unset with real data).
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : true });

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
      imageStore: deps.catalogue.imageStore,
    });
  }
  if (deps.quoteOrder) await app.register(quoteOrderController, deps.quoteOrder);
  if (deps.placeOrder) await app.register(placeOrderController, deps.placeOrder);
  if (deps.orderStatus) await app.register(orderStatusController, deps.orderStatus);
  if (deps.acceptOrder) await app.register(acceptOrderController, deps.acceptOrder);
  if (deps.rejectOrder) await app.register(rejectOrderController, deps.rejectOrder);
  if (deps.advanceOrder) await app.register(advanceOrderController, deps.advanceOrder);
  if (deps.revertOrder) await app.register(revertOrderController, deps.revertOrder);
  if (deps.tickItem) await app.register(tickItemController, deps.tickItem);
  if (deps.boardSnapshot) await app.register(boardSnapshotController, deps.boardSnapshot);
  if (deps.staffStream) await app.register(staffStreamController, deps.staffStream);
  if (deps.setActiveStations)
    await app.register(setActiveStationsController, deps.setActiveStations);
  if (deps.staffMenu) await app.register(staffMenuController, deps.staffMenu);
  if (deps.devSessions) await app.register(devSessionController, deps.devSessions);
  if (deps.devKitchen) await app.register(devKitchenController, deps.devKitchen);

  return app;
}
