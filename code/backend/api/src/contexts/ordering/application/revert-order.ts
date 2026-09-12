import type { OrderTicket } from '@veyroxai/contracts';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { OrderNotFound } from '../infrastructure/kitchen-order-repository.js';

export { OrderNotFound };

export class RevertOrder {
  constructor(
    private readonly repository: KitchenOrderRepository,
    private readonly etaQueue: EtaQueueRepository,
  ) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    const result = await this.repository.revert(input);

    // Revert can move a ticket in either direction (back into the queue, out of
    // it, or between received/preparing) - rare enough that invalidating the
    // cache for one extra Postgres rebuild is safer than a bespoke incremental
    // event for every reversible transition (see EtaQueueRepository.invalidate).
    if (!result.replayed) await this.etaQueue.invalidate(input.tenantId);

    return result;
  }
}
