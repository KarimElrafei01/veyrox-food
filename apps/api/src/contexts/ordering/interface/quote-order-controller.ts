import type { FastifyInstance } from 'fastify';
import { quoteOrderRequest } from '@veyroxai/contracts';
import {
  estimateEta,
  MenuVersionGone,
  ModifierGroupRequired,
  ModifierSelectionInvalid,
  previewPoints,
} from '@veyroxai/domain';
import type { QuoteOrder } from '../application/quote-order.js';
import { verifyCustomerSession } from './session-token.js';

export async function quoteOrderController(
  app: FastifyInstance,
  options: { quote: QuoteOrder; keys: readonly [string, ...string[]] },
): Promise<void> {
  app.post(
    '/public/orders/quote',
    { schema: { body: quoteOrderRequest } },
    async (request, reply) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer '))
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      try {
        const session = verifyCustomerSession(
          authorization.slice(7),
          options.keys,
          Math.floor(Date.now() / 1000),
        );
        const body = quoteOrderRequest.parse(
          Buffer.isBuffer(request.body) ? JSON.parse(request.body.toString('utf8')) : request.body,
        );
        const priced = await options.quote.execute({
          tenantId: session.tenantId,
          menuVersionId: session.menuVersionId,
          tier: session.tier,
          items: body.items,
        });
        const eta = estimateEta(priced.etaItems, [], session.tier, 1, new Date());
        return {
          lines: priced.lines,
          subtotalMinor: priced.subtotalMinor,
          discountMinor: priced.discountMinor,
          totalMinor: priced.totalMinor,
          unavailable: priced.unavailable,
          eta,
          loyalty: { ...previewPoints(priced.totalMinor, session.tier), tier: session.tier },
          payAt: 'counter',
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
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      }
    },
  );
}
