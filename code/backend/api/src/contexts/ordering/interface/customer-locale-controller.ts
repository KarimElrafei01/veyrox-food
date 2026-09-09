import type { FastifyInstance } from 'fastify';
import {
  idempotencyKeyHeader,
  updateLocaleRequest,
  updateLocaleResponse,
} from '@veyroxai/contracts';
import type { CustomerLocaleRepository } from '../infrastructure/customer-locale-repository.js';
import { CustomerLocaleNotFound } from '../infrastructure/customer-locale-repository.js';
import {
  SessionExpired,
  SessionInvalid,
  verifyCustomerSession,
} from '../../identity/domain/index.js';

export async function customerLocaleController(
  app: FastifyInstance,
  options: { repository: CustomerLocaleRepository; keys: readonly [string, ...string[]] },
): Promise<void> {
  app.post(
    '/public/session/locale',
    { schema: { body: updateLocaleRequest, headers: idempotencyKeyHeader } },
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
        const body = updateLocaleRequest.parse(request.body);
        const header = idempotencyKeyHeader.parse(request.headers);
        const result = await options.repository.update({
          ...body,
          tenantId: session.tenantId,
          customerId: session.customerId,
          idempotencyKey: header['idempotency-key'],
        });
        if (result.replayed) reply.header('Idempotency-Replayed', 'true');
        const response = updateLocaleResponse.parse({
          locale: result.locale,
          sequence: result.sequence,
        });
        return reply.status(result.replayed ? 200 : 201).send({ ...response, traceId: request.id });
      } catch (error) {
        if (error instanceof CustomerLocaleNotFound)
          return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
        if (error instanceof SessionInvalid)
          return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
        throw error;
      }
    },
  );
}
