import type { OrderTicket } from '@veyroxai/contracts';
import type { KitchenEvent } from '../infrastructure/kitchen-order-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';

/** backend doc §3: one order_events row, serialized as one SSE event. Shared by
 *  accept/reject/advance/revert - all four produce the identical event shape,
 *  differing only in the fromStatus/toStatus/actorType the row already carries. */
export function publishOrderTransitioned(
  sseHub: Pick<SseHub, 'publish'>,
  tenantId: string,
  orderId: string,
  event: KitchenEvent,
  ticket: OrderTicket,
): void {
  sseHub.publish(tenantId, {
    id: event.id,
    event: 'order.transitioned',
    data: {
      orderId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorType: event.actorType,
      occurredAt: event.createdAt.toISOString(),
      order: ticket,
    },
  });
}

export function publishItemTicked(
  sseHub: Pick<SseHub, 'publish'>,
  tenantId: string,
  orderId: string,
  event: KitchenEvent,
  orderItemId: string,
  ticked: boolean,
): void {
  sseHub.publish(tenantId, {
    id: event.id,
    event: 'order.item_ticked',
    data: { orderId, orderItemId, ticked, occurredAt: event.createdAt.toISOString() },
  });
}
