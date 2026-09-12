import { describe, expect, it, vi } from 'vitest';
import { RejectOrder } from './reject-order.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { OrderTicket } from '@veyroxai/contracts';

const now = new Date('2026-09-06T12:05:00.000Z');

describe('RejectOrder', () => {
  it('forwards the reason code and idempotency key to the repository', async () => {
    const reject = vi.fn(
      async () => ({ ticket: { status: 'rejected' } as OrderTicket, replayed: false }) as const,
    );
    const repository = { reject } as unknown as KitchenOrderRepository;
    const rejectOrder = new RejectOrder(repository, { publish: vi.fn() });

    await rejectOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      reasonCode: 'item_unavailable',
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });

    expect(reject).toHaveBeenCalledWith({
      tenantId: 't1',
      orderId: 'o1',
      reasonCode: 'item_unavailable',
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });
  });
});
