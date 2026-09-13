import { orderTicket, type OrderTicket } from '@veyroxai/contracts';
import type { HttpClient } from '@veyroxai/api-client';

/** POST /orders/:id/advance - Received->Preparing or Preparing->Ready. */
export function advanceOrder(
  client: HttpClient,
  orderId: string,
  toStatus: 'preparing' | 'ready',
  idempotencyKey: string,
): Promise<OrderTicket> {
  return client.post(`/orders/${orderId}/advance`, {
    body: { toStatus, idempotencyKey },
    schema: orderTicket,
  });
}
