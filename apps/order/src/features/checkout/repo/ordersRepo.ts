import type { HttpClient } from '@veyroxai/api-client';
import {
  placeOrderResponse,
  type PlaceOrderRequest,
  type PlaceOrderResponse,
} from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/** POST /public/orders (F1.6 §2). Idempotency key is required (client-generated UUIDv7). */
export function placeOrder(
  request: PlaceOrderRequest,
  idempotencyKey: string,
  client: HttpClient = getApiClient(),
): Promise<PlaceOrderResponse> {
  return client.post('/public/orders', {
    body: request,
    schema: placeOrderResponse,
    idempotencyKey,
  });
}
