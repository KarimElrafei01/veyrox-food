import { and, eq, tables, withTenant, type Database } from '@veyroxai/db';
import { estimateEta, type LoyaltyTier } from '@veyroxai/domain';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { EtaQueueRepository } from '../contexts/ordering/infrastructure/eta-queue-repository.js';

/**
 * Dev-only. There's no KDS yet, so a hand-placed test order has no way past
 * 'placed' — this simulates the kitchen actions a KDS will eventually send
 * (Accept / Preparing / Ready / Reject) so the webview's live status screens can
 * be exercised by hand. Registered by main.ts only when DEV_LOGIN=1.
 */

const PARAMS = z.object({ orderId: z.uuid() });
const BODY = z.object({
  tenantId: z.uuid(),
  action: z.enum(['accept', 'preparing', 'ready', 'reject']),
});

interface Deps {
  db: Database;
  etaQueue: EtaQueueRepository;
}

export async function devKitchenController(
  app: FastifyInstance,
  { db, etaQueue }: Deps,
): Promise<void> {
  app.post(
    '/dev/orders/:orderId/advance',
    { schema: { params: PARAMS, body: BODY } },
    async (request, reply) => {
      const { orderId } = PARAMS.parse(request.params);
      const { tenantId, action } = BODY.parse(request.body);
      const now = new Date();

      const nextStatus = await withTenant(db, tenantId, async (tx) => {
        const [order] = await tx
          .select()
          .from(tables.orders)
          .where(and(eq(tables.orders.id, orderId), eq(tables.orders.tenantId, tenantId)));
        if (!order) return null;

        if (action === 'accept') {
          const [customer] = order.customerId
            ? await tx
                .select({ tier: tables.customers.tier })
                .from(tables.customers)
                .where(eq(tables.customers.id, order.customerId))
            : [];
          const items = await tx
            .select({ prepSeconds: tables.menuItems.basePrepSeconds })
            .from(tables.orderItems)
            .innerJoin(tables.menuItems, eq(tables.menuItems.id, tables.orderItems.menuItemId))
            .where(eq(tables.orderItems.orderId, orderId));
          const queue = await etaQueue.load(tenantId);
          // Same estimator a real Accept will eventually call — the promise this
          // writes is one a tester can trust, not a placeholder.
          const estimate = estimateEta(
            items,
            queue.state.tickets,
            (customer?.tier as LoyaltyTier | undefined) ?? null,
            queue.state.activeStations,
            now,
            queue.source === 'degraded' ? 1.5 : 1.25,
          );
          await tx
            .update(tables.orders)
            .set({
              status: 'received',
              acceptedAt: now,
              promisedEtaLowerAt: new Date(now.getTime() + estimate.lowerMinutes * 60_000),
              promisedEtaUpperAt: new Date(now.getTime() + estimate.upperMinutes * 60_000),
            })
            .where(eq(tables.orders.id, orderId));
        } else if (action === 'preparing') {
          await tx
            .update(tables.orders)
            .set({ status: 'preparing' })
            .where(eq(tables.orders.id, orderId));
        } else if (action === 'ready') {
          await tx
            .update(tables.orders)
            .set({ status: 'ready', readyAt: now })
            .where(eq(tables.orders.id, orderId));
        } else {
          await tx
            .update(tables.orders)
            .set({ status: 'rejected', rejectionReason: 'too_busy', rejectedAt: now })
            .where(eq(tables.orders.id, orderId));
        }

        const toStatus =
          action === 'accept'
            ? 'received'
            : action === 'preparing'
              ? 'preparing'
              : action === 'ready'
                ? 'ready'
                : 'rejected';
        await tx.insert(tables.orderEvents).values({
          tenantId,
          orderId,
          fromStatus: order.status,
          toStatus,
          actorType: 'staff',
          source: 'kds',
          reason: `dev-simulated ${action}`,
        });
        return toStatus;
      });

      if (!nextStatus) return reply.status(404).send({ code: 'ORDER_NOT_FOUND' });
      return { status: nextStatus };
    },
  );
}
