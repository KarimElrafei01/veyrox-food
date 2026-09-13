import { orderTicket, type OrderTicket, type RejectOrderRequest } from '@veyroxai/contracts';
import type { HttpClient } from '@veyroxai/api-client';

/** POST /orders/:id/reject - New-column only, no ledger rows (backend doc §2.3). */
export function rejectOrder(
  client: HttpClient,
  orderId: string,
  reasonCode: RejectOrderRequest['reasonCode'],
  idempotencyKey: string,
): Promise<OrderTicket> {
  return client.post(`/orders/${orderId}/reject`, {
    body: { reasonCode, idempotencyKey },
    schema: orderTicket,
  });
}
