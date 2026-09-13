import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { acceptOrderRequest } from '@veyroxai/contracts';
import { authenticateStaff, StaffSessionExpired, StaffSessionInvalid } from './staff-auth.js';
import type { AcceptOrder } from '../application/accept-order.js';
import { OrderNotFound } from '../application/accept-order.js';
import {
  InvalidTransition,
  ItemNoLongerAvailable,
} from '../infrastructure/kitchen-order-repository.js';

const params = z.object({ id: z.uuid() });

export async function acceptOrderController(
  app: FastifyInstance,
  options: {
    accept: AcceptOrder;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  },
): Promise<void> {
  app.post(
    '/orders/:id/accept',
    { schema: { params, body: acceptOrderRequest } },
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
        const { id: orderId } = params.parse(request.params);
        const { idempotencyKey } = acceptOrderRequest.parse(request.body);

        const result = await options.accept.execute({
          tenantId: staff.tenantId,
          orderId,
          idempotencyKey,
          actor: { type: 'staff', staffId: staff.staffId },
          now: new Date(),
        });

        if (!result.replayed) await options.emit({ orderId, tenantId: staff.tenantId });
        return reply
          .header('Idempotency-Replayed', result.replayed ? 'true' : 'false')
          .status(200)
          .send({ ...result.ticket, traceId: request.id });
      } catch (error) {
        if (error instanceof StaffSessionExpired) return reject('SESSION_EXPIRED', 401);
        if (error instanceof StaffSessionInvalid) return reject('SESSION_INVALID', 401);
        if (error instanceof OrderNotFound) return reject('ORDER_NOT_FOUND', 404);
        if (error instanceof InvalidTransition)
          return reject('INVALID_TRANSITION', 409, {
            allowedTransitions: error.allowedTransitions,
          });
        if (error instanceof ItemNoLongerAvailable)
          return reject('ITEM_NO_LONGER_AVAILABLE', 409, { unavailable: error.unavailable });
        throw error;
      }
    },
  );
}
