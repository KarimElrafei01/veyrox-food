import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  verifyCustomerSession,
  SessionExpired,
  SessionInvalid,
} from '../../identity/domain/index.js';
import { describeOrderStatus, OrderNotFound } from '../application/order-status.js';
import type { OrderStatusRepository } from '../infrastructure/order-status-repository.js';

const params = z.object({ orderId: z.uuid() });

export async function orderStatusController(
  app: FastifyInstance,
  options: { orders: OrderStatusRepository; keys: readonly [string, ...string[]] },
): Promise<void> {
  app.get('/public/orders/:orderId/status', { schema: { params } }, async (request, reply) => {
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
      const { orderId } = params.parse(request.params);
      const row = await options.orders.findOwnedOrder(
        session.tenantId,
        session.customerId,
        orderId,
      );
      if (!row) throw new OrderNotFound();
      return {
        ...describeOrderStatus(row, { tier: session.tier, now: new Date() }),
        traceId: request.id,
      };
    } catch (error) {
      if (error instanceof OrderNotFound)
        return reply.status(404).send({ code: 'ORDER_NOT_FOUND', traceId: request.id });
      if (error instanceof SessionInvalid)
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      throw error;
    }
  });
}
