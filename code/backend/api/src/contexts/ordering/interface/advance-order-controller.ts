import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { advanceOrderRequest } from '@veyroxai/contracts';
import { authenticateStaff, StaffSessionExpired, StaffSessionInvalid } from './staff-auth.js';
import type { AdvanceOrder } from '../application/advance-order.js';
import { OrderNotFound } from '../application/advance-order.js';
import { InvalidTransition } from '../infrastructure/kitchen-order-repository.js';

const params = z.object({ id: z.uuid() });

export async function advanceOrderController(
  app: FastifyInstance,
  options: {
    advance: AdvanceOrder;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
    emit: (event: { orderId: string; tenantId: string }) => Promise<void>;
  },
): Promise<void> {
  app.post(
    '/orders/:id/advance',
    { schema: { params, body: advanceOrderRequest } },
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
        const { toStatus, idempotencyKey } = advanceOrderRequest.parse(request.body);

        const result = await options.advance.execute({
          tenantId: staff.tenantId,
          orderId,
          toStatus,
          idempotencyKey,
          staffId: staff.staffId,
          now: new Date(),
        });

        // The literal mechanism behind "Guest Notified" (frontend doc §4.1) -
        // entering ready is what the commit hook uses to enqueue the
        // ready-notification WhatsApp send (05-api-and-integration-contracts.md §3).
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
        throw error;
      }
    },
  );
}
