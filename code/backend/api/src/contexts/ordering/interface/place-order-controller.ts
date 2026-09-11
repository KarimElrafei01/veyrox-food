import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { idempotencyKeyHeader, placeOrderRequest } from '@veyroxai/contracts';
import { MenuVersionGone, ModifierGroupRequired, ModifierSelectionInvalid } from '@veyroxai/domain';
import type { LoyaltyTier } from '@veyroxai/domain';
import {
  verifyCustomerSession,
  SessionExpired,
  SessionInvalid,
} from '../../identity/domain/index.js';
import { assembleQuoteBody } from './quote-body.js';
import {
  type PlaceOrder,
  ItemUnavailable,
  MinimumOrderValue,
  PriceChanged,
} from '../application/place-order.js';
import type { OrderPlacementMetricSink } from '../application/order-placement-metrics.js';
import {
  type ResolveCustomerSession,
  OrderingSuspended,
  StoreClosed,
  WhatsAppOrderingDisabled,
} from '../application/resolve-customer-session.js';
import {
  CatalogueSnapshotMissing,
  ItemsUnavailableAtPlacement,
  OpenOrderLimit,
} from '../infrastructure/order-placement-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import { recordEtaRead, type EtaMetricSink } from '../application/eta-metrics.js';

export async function placeOrderController(
  app: FastifyInstance,
  options: {
    place: PlaceOrder;
    resolver: ResolveCustomerSession;
    keys: readonly [string, ...string[]];
    etaQueue: EtaQueueRepository;
    etaMetrics: EtaMetricSink;
    metrics: OrderPlacementMetricSink;
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  },
): Promise<void> {
  app.post(
    '/public/orders',
    { schema: { body: placeOrderRequest, headers: idempotencyKeyHeader } },
    async (request, reply) => {
      const startedAt = process.hrtime.bigint();
      const reject = (
        code: string,
        status: number,
        extra?: Record<string, unknown>,
      ): FastifyReply => {
        options.metrics.increment('order_placement_rejected_total', { code });
        return reply.status(status).send({ code, traceId: request.id, ...extra });
      };

      let tenantId: string | null = null;
      let tier: LoyaltyTier = 'bronze';
      try {
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) return reject('SESSION_INVALID', 401);

        const session = verifyCustomerSession(
          authorization.slice(7),
          options.keys,
          Math.floor(Date.now() / 1000),
        );
        tenantId = session.tenantId;
        const resolved = await options.resolver.execute(session, new Date());
        tier = resolved.customer.tier;
        const body = parseBody(request);
        const header = idempotencyKeyHeader.parse(request.headers);

        const placed = await options.place.execute({
          tenantId: session.tenantId,
          customerId: session.customerId,
          menuVersionId: session.menuVersionId,
          tier: resolved.customer.tier,
          minOrderValueMinor: resolved.ordering.minOrderValueMinor,
          idempotencyKey: header['idempotency-key'],
          traceId: request.id,
          request: body,
        });

        if (placed.replayed) {
          options.metrics.increment('idempotency_replay_total');
          return reply.header('Idempotency-Replayed', 'true').status(200).send(placed.response);
        }

        options.metrics.increment('orders_placed_total', { channel: 'whatsapp' });
        await options.emit({ orderId: placed.order.orderId, tenantId: session.tenantId });
        return reply.status(201).send(placed.response);
      } catch (error) {
        if (error instanceof SessionExpired) return reject('SESSION_EXPIRED', 401);
        if (error instanceof SessionInvalid) return reject('SESSION_INVALID', 401);
        if (error instanceof WhatsAppOrderingDisabled || error instanceof OrderingSuspended)
          return reject('ORDERING_SUSPENDED', 403);
        if (error instanceof StoreClosed) return reject('STORE_CLOSED', 409);
        if (error instanceof OpenOrderLimit)
          return reject('OPEN_ORDER_LIMIT', 409, { existingOrder: error.existing });
        if (error instanceof PriceChanged) {
          options.metrics.increment('price_changed_total');
          const quote = tenantId
            ? await (async () => {
                const queue = await options.etaQueue.load(tenantId);
                recordEtaRead(options.etaMetrics, queue.source, queue.state.tickets.length);
                return {
                  ...assembleQuoteBody(error.priced, queue, tier, new Date()),
                  traceId: request.id,
                };
              })()
            : undefined;
          return reject('PRICE_CHANGED', 409, quote ? { quote } : undefined);
        }
        if (error instanceof ItemUnavailable || error instanceof ItemsUnavailableAtPlacement)
          return reject('ITEM_UNAVAILABLE', 409, { unavailable: error.unavailable });
        if (error instanceof MinimumOrderValue) return reject('MIN_ORDER_VALUE', 422);
        if (error instanceof MenuVersionGone) return reject('MENU_VERSION_GONE', 409);
        if (error instanceof ModifierGroupRequired)
          return reject('MODIFIER_GROUP_REQUIRED', 422, { groupId: error.groupId });
        if (error instanceof ModifierSelectionInvalid)
          return reject('MODIFIER_SELECTION_INVALID', 422, {
            groupId: error.groupId,
            min: error.min,
            max: error.max,
            got: error.got,
          });
        if (error instanceof CatalogueSnapshotMissing)
          return reject('CATALOGUE_SNAPSHOT_MISSING', 409);
        throw error;
      } finally {
        options.metrics.observe(
          'order_placement_duration_seconds',
          Number(process.hrtime.bigint() - startedAt) / 1e9,
        );
      }
    },
  );
}

/** The webhook plugin keeps a raw-buffer JSON parser in its own scope (F1.1). This
 *  route gets parsed objects, but a fallback decode keeps it correct if that ever
 *  leaks. */
function parseBody(request: FastifyRequest): ReturnType<typeof placeOrderRequest.parse> {
  const raw = Buffer.isBuffer(request.body)
    ? (JSON.parse(request.body.toString('utf8')) as unknown)
    : request.body;
  return placeOrderRequest.parse(raw);
}
