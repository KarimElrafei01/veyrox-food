import type { HttpClient } from '@veyroxai/api-client';
import { orderStatusResponse, type OrderStatusResponse } from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/** GET /public/orders/:orderId/status (F1.7 §2). Never polled. */
export function fetchOrderStatus(
  orderId: string,
  client: HttpClient = getApiClient(),
): Promise<OrderStatusResponse> {
  return client.get(`/public/orders/${encodeURIComponent(orderId)}/status`, orderStatusResponse);
}
