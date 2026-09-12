import type { OrderTicket } from '@veyroxai/contracts';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { OrderNotFound } from '../infrastructure/kitchen-order-repository.js';

export { OrderNotFound };

export class RejectOrder {
  constructor(private readonly repository: KitchenOrderRepository) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    reasonCode: 'too_busy' | 'item_unavailable' | 'closing';
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    return this.repository.reject(input);
  }
}
