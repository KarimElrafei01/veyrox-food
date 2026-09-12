import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { OrderNotFound, OrderItemNotFound } from '../infrastructure/kitchen-order-repository.js';

export { OrderNotFound, OrderItemNotFound };

export class TickItem {
  constructor(private readonly repository: KitchenOrderRepository) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    orderItemId: string;
    ticked: boolean;
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ orderItemId: string; ticked: boolean; replayed: boolean }> {
    return this.repository.tickItem(input);
  }
}
