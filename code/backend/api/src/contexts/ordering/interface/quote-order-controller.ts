import type { FastifyInstance } from 'fastify';
import { quoteOrderRequest } from '@veyroxai/contracts';
import { MenuVersionGone, ModifierGroupRequired, ModifierSelectionInvalid } from '@veyroxai/domain';
import type { QuoteOrder } from '../application/quote-order.js';
import {
  SessionExpired,
  SessionInvalid,
  verifyCustomerSession,
} from '../../identity/domain/index.js';
import { assembleQuoteBody } from './quote-body.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import { recordEtaRead, type EtaMetricSink } from '../application/eta-metrics.js';

export async function quoteOrderController(
  app: FastifyInstance,
  options: {
    quote: QuoteOrder;
    keys: readonly [string, ...string[]];
    etaQueue: EtaQueueRepository;
    etaMetrics: EtaMetricSink;
  },
): Promise<void> {
  app.post(
    '/public/orders/quote',
    { schema: { body: quoteOrderRequest } },
    async (request, reply) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer '))
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      let session;
      try {
        session = verifyCustomerSession(
          authorization.slice(7),
          options.keys,
          Math.floor(Date.now() / 1000),
        );
      } catch (error) {
        return reply.status(401).send({
          code: error instanceof SessionExpired ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
          traceId: request.id,
        });
      }
      try {
        const body = quoteOrderRequest.parse(
          Buffer.isBuffer(request.body) ? JSON.parse(request.body.toString('utf8')) : request.body,
        );
        const priced = await options.quote.execute({
          tenantId: session.tenantId,
          menuVersionId: session.menuVersionId,
          tier: session.tier,
          items: body.items,
        });
        const queue = await options.etaQueue.load(session.tenantId);
        recordEtaRead(options.etaMetrics, queue.source, queue.state.tickets.length);
        return {
          ...assembleQuoteBody(priced, queue, session.tier, new Date()),
          traceId: request.id,
        };
      } catch (error) {
        if (error instanceof ModifierGroupRequired)
          return reply.status(422).send({
            code: 'MODIFIER_GROUP_REQUIRED',
            groupId: error.groupId,
            traceId: request.id,
          });
        if (error instanceof ModifierSelectionInvalid)
          return reply.status(422).send({
            code: 'MODIFIER_SELECTION_INVALID',
            groupId: error.groupId,
            min: error.min,
            max: error.max,
            got: error.got,
            traceId: request.id,
          });
        if (error instanceof MenuVersionGone)
          return reply.status(409).send({ code: 'MENU_VERSION_GONE', traceId: request.id });
        if (error instanceof SessionInvalid)
          return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
        throw error;
      }
    },
  );
}
