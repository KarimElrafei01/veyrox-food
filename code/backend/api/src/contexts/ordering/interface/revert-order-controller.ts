import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { revertOrderRequest } from '@veyroxai/contracts';
import { authenticateStaff, StaffSessionExpired, StaffSessionInvalid } from './staff-auth.js';
import type { RevertOrder } from '../application/revert-order.js';
import { OrderNotFound } from '../application/revert-order.js';
import {
  InvalidTransition,
  RevertWindowExpired,
} from '../infrastructure/kitchen-order-repository.js';

const params = z.object({ id: z.uuid() });

export async function revertOrderController(
  app: FastifyInstance,
  options: {
    revert: RevertOrder;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  },
): Promise<void> {
  app.post(
    '/orders/:id/revert',
    { schema: { params, body: revertOrderRequest } },
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
        const { idempotencyKey } = revertOrderRequest.parse(request.body);

        const result = await options.revert.execute({
          tenantId: staff.tenantId,
          orderId,
          idempotencyKey,
          staffId: staff.staffId,
          now: new Date(),
        });

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
        if (error instanceof RevertWindowExpired)
          return reject('REVERT_WINDOW_EXPIRED', 409, {
            detail: 'This can no longer be undone from the KDS — void the order instead.',
          });
        throw error;
      }
    },
  );
}
