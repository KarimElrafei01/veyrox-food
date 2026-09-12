import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { OrderNotFound, OrderItemNotFound } from '../infrastructure/kitchen-order-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';
import { publishItemTicked } from './sse-events.js';

export { OrderNotFound, OrderItemNotFound };

export class TickItem {
  constructor(
    private readonly repository: KitchenOrderRepository,
    private readonly sseHub: Pick<SseHub, 'publish'>,
  ) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    orderItemId: string;
    ticked: boolean;
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ orderItemId: string; ticked: boolean; replayed: boolean }> {
    const result = await this.repository.tickItem(input);
    if (!result.replayed && result.event)
      publishItemTicked(
        this.sseHub,
        input.tenantId,
        input.orderId,
        result.event,
        result.orderItemId,
        result.ticked,
      );
    return result;
  }
}
