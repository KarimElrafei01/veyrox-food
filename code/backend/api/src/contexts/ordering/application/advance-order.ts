import type { OrderTicket } from '@veyroxai/contracts';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import { applyEtaQueueEvent } from '../infrastructure/eta-queue-repository.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { OrderNotFound } from '../infrastructure/kitchen-order-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';
import { publishOrderTransitioned } from './sse-events.js';

export { OrderNotFound };

export class AdvanceOrder {
  constructor(
    private readonly repository: KitchenOrderRepository,
    private readonly etaQueue: EtaQueueRepository,
    private readonly sseHub: Pick<SseHub, 'publish'>,
  ) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    toStatus: 'preparing' | 'ready';
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    const result = await this.repository.advance(input);

    // Post-commit cache update (ADR-0005: publish after commit, never inline) -
    // Preparing starts the remaining-prep decay for F1.4's queue depth; Ready
    // removes the ticket, mirroring rebuild()'s own `status IN (received,
    // preparing)` query so the incremental path never disagrees with a rebuild.
    if (!result.replayed) {
      const queue = await this.etaQueue.load(input.tenantId);
      const queueEvent =
        input.toStatus === 'preparing'
          ? ({ type: 'preparing', orderId: input.orderId, startedAt: input.now } as const)
          : ({ type: 'removed', orderId: input.orderId } as const);
      await this.etaQueue.replace(
        input.tenantId,
        applyEtaQueueEvent(queue.state, queueEvent, input.now),
      );

      if (result.event)
        publishOrderTransitioned(
          this.sseHub,
          input.tenantId,
          input.orderId,
          result.event,
          result.ticket,
        );
    }

    return result;
  }
}
