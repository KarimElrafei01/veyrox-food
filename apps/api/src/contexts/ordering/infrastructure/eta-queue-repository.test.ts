import { describe, expect, it } from 'vitest';
import {
  applyEtaQueueEvent,
  EtaQueueRepository,
  type EtaQueueState,
} from './eta-queue-repository.js';

describe('EtaQueueRepository', () => {
  it('uses the event-driven Redis projection without touching the fallback', async () => {
    const values = new Map<string, string>();
    const redis = {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const repository = new EtaQueueRepository(null as never, redis);
    const state: EtaQueueState = {
      activeStations: 2,
      tickets: [{ prepSeconds: 120, status: 'received', startedAt: null, tier: 'bronze' }],
      updatedAt: '2026-09-06T12:00:00.000Z',
    };
    await repository.replace('tenant', state);
    await expect(repository.load('tenant')).resolves.toEqual({ state, source: 'redis' });
  });

  it('keeps the projection aligned with accepted, preparing, and removed tickets', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    const accepted = applyEtaQueueEvent(
      { activeStations: 0, tickets: [], updatedAt: now.toISOString() },
      { type: 'accepted', orderId: 'order-1', prepSeconds: 120, tier: 'gold' },
      now,
    );
    const preparing = applyEtaQueueEvent(
      accepted,
      { type: 'preparing', orderId: 'order-1', startedAt: now },
      now,
    );
    expect(preparing.tickets[0]).toMatchObject({ orderId: 'order-1', status: 'preparing' });
    expect(
      applyEtaQueueEvent(preparing, { type: 'removed', orderId: 'order-1' }, now).tickets,
    ).toEqual([]);
  });
});
