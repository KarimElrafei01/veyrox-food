import { describe, expect, it, vi } from 'vitest';
import { StreamBoardEvents } from './stream-board.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { LoadBoardSnapshot } from './load-board-snapshot.js';
import type { SseHub } from '../infrastructure/sse-hub.js';
import type { OrderTicket } from '@veyroxai/contracts';

const now = new Date('2026-09-06T12:10:00.000Z');

function subject(options: {
  currentMaxEventId?: string | null;
  replayEvents?: Awaited<ReturnType<KitchenOrderRepository['replayEvents']>>;
  loadTicketById?: OrderTicket | null;
}) {
  const writes: string[] = [];
  const subscribeUnsub = vi.fn();
  const repository = {
    currentMaxEventId: vi.fn(async () => options.currentMaxEventId ?? null),
    replayEvents: vi.fn(async () => options.replayEvents ?? []),
    loadTicketById: vi.fn(async () => options.loadTicketById ?? null),
  } as unknown as KitchenOrderRepository;
  const board = {
    execute: vi.fn(async () => ({ asOfEventId: 'snap', columns: {}, metrics: {} })),
  } as unknown as LoadBoardSnapshot;
  const sseHub = { subscribe: vi.fn(() => subscribeUnsub) } as unknown as SseHub;
  const stream = new StreamBoardEvents(repository, board, sseHub);
  return { stream, writes, repository, board, sseHub, subscribeUnsub };
}

describe('StreamBoardEvents.connect', () => {
  it('subscribes before ever reading the replay range', async () => {
    const { stream, sseHub, repository } = subject({ currentMaxEventId: null });
    const order = [] as string[];
    (sseHub.subscribe as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('subscribe');
      return vi.fn();
    });
    (repository.currentMaxEventId as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('currentMaxEventId');
      return null;
    });

    await stream.connect({
      tenantId: 't1',
      lastEventId: null,
      now,
      subscriber: { write: vi.fn() },
    });

    expect(order).toEqual(['subscribe', 'currentMaxEventId']);
  });

  it('replays nothing on a first connection with no prior position', async () => {
    const { stream, repository } = subject({ currentMaxEventId: 'e5' });
    const write = vi.fn();
    await stream.connect({ tenantId: 't1', lastEventId: null, now, subscriber: { write } });
    expect(repository.replayEvents).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('replays a transitioned event with the order current ticket', async () => {
    const ticket = { orderId: 'o1', status: 'received' } as unknown as OrderTicket;
    const { stream } = subject({
      currentMaxEventId: 'e5',
      replayEvents: [
        {
          id: 'e5',
          orderId: 'o1',
          fromStatus: 'placed',
          toStatus: 'received',
          actorType: 'staff',
          createdAt: now,
          metadata: null,
        },
      ],
      loadTicketById: ticket,
    });
    const write = vi.fn();

    await stream.connect({ tenantId: 't1', lastEventId: 'e1', now, subscriber: { write } });

    expect(write).toHaveBeenCalledTimes(1);
    const chunk = write.mock.calls[0]?.[0] as string;
    expect(chunk).toContain('id: e5');
    expect(chunk).toContain('event: order.transitioned');
    expect(chunk).toContain('"orderId":"o1"');
  });

  it('replays an item_tick event without loading a ticket', async () => {
    const { stream, repository } = subject({
      currentMaxEventId: 'e5',
      replayEvents: [
        {
          id: 'e5',
          orderId: 'o1',
          fromStatus: 'preparing',
          toStatus: 'preparing',
          actorType: 'staff',
          createdAt: now,
          metadata: { action: 'item_tick', orderItemId: 'oi1', ticked: true },
        },
      ],
    });
    const write = vi.fn();

    await stream.connect({ tenantId: 't1', lastEventId: 'e1', now, subscriber: { write } });

    expect(repository.loadTicketById).not.toHaveBeenCalled();
    const chunk = write.mock.calls[0]?.[0] as string;
    expect(chunk).toContain('event: order.item_ticked');
    expect(chunk).toContain('"orderItemId":"oi1"');
  });

  it('sends one board.snapshot event instead of replaying past the gap cap', async () => {
    const manyEvents = Array.from({ length: 201 }, (_, i) => ({
      id: `e${i}`,
      orderId: 'o1',
      fromStatus: 'received',
      toStatus: 'preparing',
      actorType: 'staff',
      createdAt: now,
      metadata: null,
    }));
    const { stream, board } = subject({ currentMaxEventId: 'e200', replayEvents: manyEvents });
    const write = vi.fn();

    await stream.connect({ tenantId: 't1', lastEventId: 'e-100', now, subscriber: { write } });

    expect(board.execute).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0] as string).toContain('event: board.snapshot');
  });

  it('caches the ticket lookup across multiple events for the same order', async () => {
    const ticket = { orderId: 'o1' } as unknown as OrderTicket;
    const { stream, repository } = subject({
      currentMaxEventId: 'e6',
      replayEvents: [
        {
          id: 'e5',
          orderId: 'o1',
          fromStatus: 'placed',
          toStatus: 'received',
          actorType: 'staff',
          createdAt: now,
          metadata: null,
        },
        {
          id: 'e6',
          orderId: 'o1',
          fromStatus: 'received',
          toStatus: 'preparing',
          actorType: 'staff',
          createdAt: now,
          metadata: null,
        },
      ],
      loadTicketById: ticket,
    });

    await stream.connect({
      tenantId: 't1',
      lastEventId: 'e1',
      now,
      subscriber: { write: vi.fn() },
    });

    expect(repository.loadTicketById).toHaveBeenCalledTimes(1);
  });
});
