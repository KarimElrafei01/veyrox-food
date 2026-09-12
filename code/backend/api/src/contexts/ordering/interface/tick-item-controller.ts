import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tickItemRequest } from '@veyroxai/contracts';
import { authenticateStaff, StaffSessionExpired, StaffSessionInvalid } from './staff-auth.js';
import type { TickItem } from '../application/tick-item.js';
import { OrderNotFound, OrderItemNotFound } from '../application/tick-item.js';
import { InvalidTransition } from '../infrastructure/kitchen-order-repository.js';

const params = z.object({ id: z.uuid(), itemId: z.uuid() });

export async function tickItemController(
  app: FastifyInstance,
  options: {
    tick: TickItem;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  },
): Promise<void> {
  app.post(
    '/orders/:id/items/:itemId/tick',
    { schema: { params, body: tickItemRequest } },
    async (request, reply) => {
      const reject = (code: string, status: number, extra?: Record<string, unknown>) =>
        reply.status(status).send({ code, traceId: request.id, ...extra });

      try {
        const staff = authenticateStaff(
          request,
          options.deviceKeys,
          options.pinKeys,
          Math.floor(Date.now() / 1000),
        );
        const { id: orderId, itemId: orderItemId } = params.parse(request.params);
        const { ticked, idempotencyKey } = tickItemRequest.parse(request.body);

        const result = await options.tick.execute({
          tenantId: staff.tenantId,
          orderId,
          orderItemId,
          ticked,
          idempotencyKey,
          staffId: staff.staffId,
          now: new Date(),
        });

        if (!result.replayed) await options.emit({ orderId, tenantId: staff.tenantId });
        return reply
          .header('Idempotency-Replayed', result.replayed ? 'true' : 'false')
          .status(200)
          .send({ orderItemId: result.orderItemId, ticked: result.ticked, traceId: request.id });
      } catch (error) {
        if (error instanceof StaffSessionExpired) return reject('SESSION_EXPIRED', 401);
        if (error instanceof StaffSessionInvalid) return reject('SESSION_INVALID', 401);
        if (error instanceof OrderNotFound) return reject('ORDER_NOT_FOUND', 404);
        if (error instanceof OrderItemNotFound) return reject('ORDER_NOT_FOUND', 404);
        if (error instanceof InvalidTransition)
          return reject('INVALID_TRANSITION', 409, {
            allowedTransitions: error.allowedTransitions,
          });
        throw error;
      }
    },
  );
}
