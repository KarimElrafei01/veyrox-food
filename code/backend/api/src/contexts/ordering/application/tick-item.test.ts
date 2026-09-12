import { describe, expect, it, vi } from 'vitest';
import { TickItem } from './tick-item.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';

const now = new Date('2026-09-06T12:05:00.000Z');

describe('TickItem', () => {
  it('forwards the tick flag and idempotency key to the repository', async () => {
    const tickItem = vi.fn(async () => ({ orderItemId: 'oi1', ticked: true, replayed: false }));
    const repository = { tickItem } as unknown as KitchenOrderRepository;
    const tick = new TickItem(repository, { publish: vi.fn() });

    await tick.execute({
      tenantId: 't1',
      orderId: 'o1',
      orderItemId: 'oi1',
      ticked: true,
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });

    expect(tickItem).toHaveBeenCalledWith({
      tenantId: 't1',
      orderId: 'o1',
      orderItemId: 'oi1',
      ticked: true,
      idempotencyKey: 'key-1',
      staffId: 'staff-1',
      now,
    });
  });
});
