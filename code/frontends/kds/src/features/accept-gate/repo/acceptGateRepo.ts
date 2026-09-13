import type { HttpClient } from '@veyroxai/api-client';
import type { OrderTicket, RejectOrderRequest } from '@veyroxai/contracts';
import { acceptOrder } from '../datasource/acceptOrder.js';
import { rejectOrder } from '../datasource/rejectOrder.js';

/** Thin wrapper over the accept-gate's two datasource calls (ADR-0018) - the
 *  wire shape and the feature's model already match (both return the same
 *  `OrderTicket` the board itself renders), so there is no translation to
 *  do here. That match is accepted as-is, not a licence to merge this into
 *  datasource/ - a future contract change (e.g. a richer accept-gate-only
 *  response) would reintroduce the split. */
export interface AcceptGateRepo {
  accept(orderId: string, idempotencyKey: string): Promise<OrderTicket>;
  reject(
    orderId: string,
    reasonCode: RejectOrderRequest['reasonCode'],
    idempotencyKey: string,
  ): Promise<OrderTicket>;
}

export function createAcceptGateRepo(client: HttpClient): AcceptGateRepo {
  return {
    accept: (orderId, idempotencyKey) => acceptOrder(client, orderId, idempotencyKey),
    reject: (orderId, reasonCode, idempotencyKey) =>
      rejectOrder(client, orderId, reasonCode, idempotencyKey),
  };
}
