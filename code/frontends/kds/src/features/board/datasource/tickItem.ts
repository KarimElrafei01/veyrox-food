import { tickItemResponse, type TickItemResponse } from '@veyroxai/contracts';
import type { HttpClient } from '@veyroxai/api-client';

/** POST /orders/:id/items/:itemId/tick - event-only, no status change (§2.6). */
export function tickItem(
  client: HttpClient,
  orderId: string,
  orderItemId: string,
  ticked: boolean,
  idempotencyKey: string,
): Promise<TickItemResponse> {
  return client.post(`/orders/${orderId}/items/${orderItemId}/tick`, {
    body: { ticked, idempotencyKey },
    schema: tickItemResponse,
  });
}
