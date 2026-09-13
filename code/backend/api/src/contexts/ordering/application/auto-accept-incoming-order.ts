import { ItemNoLongerAvailable } from '../infrastructure/kitchen-order-repository.js';
import type { AcceptOrder } from './accept-order.js';
import type { RejectOrder } from './reject-order.js';

export type AutoAcceptOutcome =
  | { outcome: 'accepted' }
  | { outcome: 'rejected'; reasonCode: 'item_unavailable' }
  /** Anything other than the expected ItemNoLongerAvailable - the order is
   *  left untouched, in placed/pending, for a human to Accept/Reject (ADR-0024:
   *  a placement that already succeeded must never fail because this
   *  follow-up step had a transient problem, and nothing should be guessed
   *  into an auto-reject on an error that isn't the one this is built for). */
  | { outcome: 'left_pending'; error: unknown };

/**
 * ADR-0024: runs §2.1 (Accept) automatically for a `kitchen.auto_accept`
 * tenant, right after order creation. Both channels share this - today only
 * `PlaceOrder`'s WhatsApp controller calls it (Till's `send-to-kitchen`
 * doesn't exist yet, Sprint 4), but the mechanism itself is channel-agnostic:
 * it only needs an already-created order's id.
 */
export class AutoAcceptIncomingOrder {
  constructor(
    private readonly accept: AcceptOrder,
    private readonly reject: RejectOrder,
  ) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<AutoAcceptOutcome> {
    try {
      // Same idempotencyKey the client sent for placement - safe to reuse:
      // placement dedups on orders.idempotency_key, Accept/Reject on
      // order_events.idempotency_key, two different unique indexes.
      await this.accept.execute({ ...input, actor: { type: 'system' } });
      return { outcome: 'accepted' };
    } catch (error) {
      if (!(error instanceof ItemNoLongerAvailable)) return { outcome: 'left_pending', error };
      try {
        await this.reject.execute({
          tenantId: input.tenantId,
          orderId: input.orderId,
          reasonCode: 'item_unavailable',
          idempotencyKey: input.idempotencyKey,
          actor: { type: 'system' },
          now: input.now,
        });
        return { outcome: 'rejected', reasonCode: 'item_unavailable' };
      } catch (rejectError) {
        return { outcome: 'left_pending', error: rejectError };
      }
    }
  }
}
