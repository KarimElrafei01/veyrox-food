import type { FastifyInstance } from 'fastify';
import { idempotencyKeyHeader, updateSessionLocaleRequest } from '@veyroxai/contracts';
import type { CustomerLocaleRepository } from '../infrastructure/customer-locale-repository.js';
import { CustomerLocaleNotFound } from '../infrastructure/customer-locale-repository.js';
import { SessionExpired, verifyCustomerSession } from './session-token.js';

export async function customerLocaleController(
  app: FastifyInstance,
  options: { repository: CustomerLocaleRepository; keys: readonly [string, ...string[]] },
): Promise<void> {
  app.post(
    '/public/session/locale',
    { schema: { body: updateSessionLocaleRequest, headers: idempotencyKeyHeader } },
    async (request, reply) => {
      try {
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer '))
          return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
        const session = verifyCustomerSession(
          authorization.slice(7),
          options.keys,
          Math.floor(Date.now() / 1000),
        );
        const body = updateSessionLocaleRequest.parse(request.body);
        const header = idempotencyKeyHeader.parse(request.headers);
        const result = await options.repository.update({
          ...body,
          tenantId: session.tenantId,
          customerId: session.customerId,
          idempotencyKey: header['idempotency-key'],
        });
        if (result.replayed) reply.header('Idempotency-Replayed', 'true');
        return reply
          .status(result.replayed ? 200 : 201)
          .send({ locale: result.locale, sequence: result.sequence, traceId: request.id });
      } catch (error) {
        if (error instanceof CustomerLocaleNotFound)
          return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
        return reply.status(401).send({
          code: error instanceof SessionExpired ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
          traceId: request.id,
        });
      }
    },
  );
}
