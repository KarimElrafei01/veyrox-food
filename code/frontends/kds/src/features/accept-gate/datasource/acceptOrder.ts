import { orderTicket, type OrderTicket } from '@veyroxai/contracts';
import type { HttpClient } from '@veyroxai/api-client';

/** POST /orders/:id/accept - the ADR-0010 kitchen-accept gate; writes material
 *  deductions server-side (backend doc §2.1). */
export function acceptOrder(
  client: HttpClient,
  orderId: string,
  idempotencyKey: string,
): Promise<OrderTicket> {
  return client.post(`/orders/${orderId}/accept`, {
    body: { idempotencyKey },
    schema: orderTicket,
  });
}
