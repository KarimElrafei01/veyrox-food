import type { OrderTicket } from '@veyroxai/contracts';
import type { OrderActor } from '../domain/order-state-machine.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { OrderNotFound } from '../infrastructure/kitchen-order-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';
import { publishOrderTransitioned } from './sse-events.js';

export { OrderNotFound };

export class RejectOrder {
  constructor(
    private readonly repository: KitchenOrderRepository,
    private readonly sseHub: Pick<SseHub, 'publish'>,
  ) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    reasonCode: 'too_busy' | 'item_unavailable' | 'closing';
    idempotencyKey: string;
    actor: OrderActor;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    const result = await this.repository.reject(input);
    if (!result.replayed && result.event)
      publishOrderTransitioned(
        this.sseHub,
        input.tenantId,
        input.orderId,
        result.event,
        result.ticket,
      );
    return result;
  }
}
