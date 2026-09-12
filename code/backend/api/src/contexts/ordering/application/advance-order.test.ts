import { describe, expect, it, vi } from 'vitest';
import { AdvanceOrder } from './advance-order.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { OrderTicket } from '@veyroxai/contracts';

const now = new Date('2026-09-06T12:10:00.000Z');

function ticket(overrides: Partial<OrderTicket> = {}): OrderTicket {
  return {
    orderId: 'o1',
    orderNumber: 'A-047',
    channel: 'whatsapp',
    status: 'preparing',
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
    revertWindow: { revertibleUntil: '2026-09-06T12:11:00.000Z' },
    syncState: 'confirmed',
    ...overrides,
  };
}

function subject(options: {
  advance?: KitchenOrderRepository['advance'];
  existingTickets?: {
    orderId: string;
    prepSeconds: number;
    status: 'received' | 'preparing';
    startedAt: Date | null;
    tier: null;
  }[];
}) {
  const advance = options.advance ?? vi.fn(async () => ({ ticket: ticket(), replayed: false }));
  const repository = { advance } as unknown as KitchenOrderRepository;
  const replace = vi.fn((..._args: Parameters<EtaQueueRepository['replace']>) => Promise.resolve());
  const etaQueue = {
    load: vi.fn(async () => ({
      state: {
        activeStations: 1,
        tickets: options.existingTickets ?? [],
        updatedAt: now.toISOString(),
      },
      source: 'postgres' as const,
    })),
    replace,
  } as unknown as EtaQueueRepository;
  const sseHub = { publish: vi.fn() };
  return { advanceOrder: new AdvanceOrder(repository, etaQueue, sseHub), advance, replace };
}

describe('AdvanceOrder', () => {
  it('marks the queue ticket preparing (starts remaining-prep decay) on Received->Preparing', async () => {
    const { advanceOrder, replace } = subject({
      existingTickets: [
        { orderId: 'o1', prepSeconds: 300, status: 'received', startedAt: null, tier: null },
      ],
    });
    await advanceOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      toStatus: 'preparing',
      idempotencyKey: 'key-1',
      staffId: 's1',
      now,
    });
    const [, nextState] = vi.mocked(replace).mock.calls[0] as [
      string,
      { tickets: { status: string; startedAt: Date | null }[] },
    ];
    expect(nextState.tickets[0]).toMatchObject({ status: 'preparing', startedAt: now });
  });

  it('removes the queue ticket entirely on Preparing->Ready', async () => {
    const { advanceOrder, replace } = subject({
      advance: vi.fn(async () => ({ ticket: ticket({ status: 'ready' }), replayed: false })),
      existingTickets: [
        { orderId: 'o1', prepSeconds: 300, status: 'preparing', startedAt: now, tier: null },
      ],
    });
    await advanceOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      toStatus: 'ready',
      idempotencyKey: 'key-1',
      staffId: 's1',
      now,
    });
    const [, nextState] = vi.mocked(replace).mock.calls[0] as [string, { tickets: unknown[] }];
    expect(nextState.tickets).toHaveLength(0);
  });

  it('never touches the queue cache on a replayed advance', async () => {
    const { advanceOrder, replace } = subject({
      advance: vi.fn(async () => ({ ticket: ticket(), replayed: true })),
    });
    await advanceOrder.execute({
      tenantId: 't1',
      orderId: 'o1',
      toStatus: 'preparing',
      idempotencyKey: 'key-1',
      staffId: 's1',
      now,
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
