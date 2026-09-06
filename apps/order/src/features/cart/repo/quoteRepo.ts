import type { HttpClient } from '@veyroxai/api-client';
import { quoteResponse, type QuoteOrderRequest, type QuoteResponse } from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';

/** POST /public/orders/quote (F1.3 §2) — pure computation, no writes. */
export function requestQuote(
  request: QuoteOrderRequest,
  client: HttpClient = getApiClient(),
): Promise<QuoteResponse> {
  return client.post('/public/orders/quote', { body: request, schema: quoteResponse });
}
