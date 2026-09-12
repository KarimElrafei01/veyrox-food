import { describe, expect, it, vi } from 'vitest';
import { RevertOrder } from './revert-order.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { OrderTicket } from '@veyroxai/contracts';

const now = new Date('2026-09-06T12:10:00.000Z');

function ticket(overrides: Partial<OrderTicket> = {}): OrderTicket {
  return {
    orderId: 'o1',
    orderNumber: 'A-047',
    channel: 'whatsapp',
    status: 'received',
    customerFirstName: 'Marcus',
    tableLabel: null,
    fulfillment: 'pickup',
    isPriority: false,
    placedAt: '2026-09-06T12:00:00.000Z',
    acceptedAt: '2026-09-06T12:01:00.000Z',
    promisedEtaUpperAt: '2026-09-06T12:15:00.000Z',
    ageSeconds: 600,
    ageBand: 'green',
    items: [],
    customerNote: null,
    revertWindow: null,
    syncState: 'confirmed',
    ...overrides,
  };
}

describe('RevertOrder', () => {
  it('invalidates the ETA queue cache after a fresh revert', async () => {
    const revert = vi.fn(async () => ({ ticket: ticket(), replayed: false }));
    const repository = { revert } as unknown as KitchenOrderRepository;
    const invalidate = vi.fn(async () => undefined);
    const etaQueue = { invalidate } as unknown as EtaQueueRepository;
    const revertOrder = new RevertOrder(repository, etaQueue);

    await revertOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      idempotencyKey: 'key-1',
      staffId: 's1',
      now,
    });

    expect(invalidate).toHaveBeenCalledWith('t1');
  });

  it('never touches the queue cache on a replayed revert - nothing moved twice', async () => {
    const revert = vi.fn(async () => ({ ticket: ticket(), replayed: true }));
    const repository = { revert } as unknown as KitchenOrderRepository;
    const invalidate = vi.fn(async () => undefined);
    const etaQueue = { invalidate } as unknown as EtaQueueRepository;
    const revertOrder = new RevertOrder(repository, etaQueue);

    await revertOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      idempotencyKey: 'key-1',
      staffId: 's1',
      now,
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
