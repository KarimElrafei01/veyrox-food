import { orderTicket, type OrderTicket } from '@veyroxai/contracts';
import type { HttpClient } from '@veyroxai/api-client';

/** POST /orders/:id/revert - undo one status transition within 60s (§2.5). */
export function revertOrder(
  client: HttpClient,
  orderId: string,
  idempotencyKey: string,
): Promise<OrderTicket> {
  return client.post(`/orders/${orderId}/revert`, {
    body: { idempotencyKey },
    schema: orderTicket,
  });
}
