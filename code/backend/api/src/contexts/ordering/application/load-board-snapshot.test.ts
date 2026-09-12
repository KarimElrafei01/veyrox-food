import { describe, expect, it, vi } from 'vitest';
import { LoadBoardSnapshot } from './load-board-snapshot.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';

const now = new Date('2026-09-06T12:05:00.000Z');

describe('LoadBoardSnapshot', () => {
  it('sources activeStations from the same ETA queue F1.4 already reads', async () => {
    const snapshot = {
      asOfEventId: 42,
      columns: { new: [], received: [], preparing: [], ready: [] },
      metrics: {
        activeTicketCount: 0,
        delayedOver15mCount: 0,
        avgTurnaroundSeconds: 0,
        railCapacity: { used: 0, slots: 16 },
        peakVelocityPerHour: 0,
      },
    };
    const repository = {
      loadBoardSnapshot: vi.fn(async () => snapshot),
    } as unknown as KitchenOrderRepository;
    const etaQueue = {
      load: vi.fn(async () => ({
        state: { activeStations: 3, tickets: [], updatedAt: now.toISOString() },
        source: 'postgres' as const,
      })),
    } as unknown as EtaQueueRepository;

    const result = await new LoadBoardSnapshot(repository, etaQueue).execute({
      tenantId: 't1',
      now,
    });

    expect(result).toEqual({ ...snapshot, activeStations: 3 });
  });
});
