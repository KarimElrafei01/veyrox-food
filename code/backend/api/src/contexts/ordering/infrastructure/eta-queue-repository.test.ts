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
      del: async (key: string) => values.delete(key),
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

  it('coalesces concurrent cache misses into a single rebuild transaction', async () => {
    let transactions = 0;
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        transactions += 1;
        const tx = {
          execute: async () => undefined,
          select: () => ({
            from: () => ({
              // The orders/menu_items join query (two innerJoins) and the
              // kitchen_state query (a plain where()) share this same mock -
              // both chain shapes need to resolve for rebuild() to succeed.
              innerJoin: () => ({
                innerJoin: () => ({
                  where: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    return [];
                  },
                }),
              }),
              where: async () => [],
            }),
          }),
        };
        return fn(tx);
      },
    };
    const redisValues = new Map<string, string>();
    const redis = {
      get: async (key: string) => redisValues.get(key) ?? null,
      set: async (key: string, value: string) => {
        redisValues.set(key, value);
      },
      del: async (key: string) => redisValues.delete(key),
    };
    const repository = new EtaQueueRepository(db as never, redis);
    await Promise.all([
      repository.load('tenant'),
      repository.load('tenant'),
      repository.load('tenant'),
    ]);
    expect(transactions).toBe(1);
  });

  it('rebuilds activeStations from kitchen_state, not a hardcoded default', async () => {
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: async () => undefined,
          select: () => ({
            from: () => ({
              innerJoin: () => ({ innerJoin: () => ({ where: async () => [] }) }),
              where: async () => [{ activeStations: 4 }],
            }),
          }),
        };
        return fn(tx);
      },
    };
    const redis = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
    };
    const repository = new EtaQueueRepository(db as never, redis);
    const { state } = await repository.load('tenant');
    expect(state.activeStations).toBe(4);
  });

  it('defaults to 1 station when a tenant has never set kitchen_state', async () => {
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          execute: async () => undefined,
          select: () => ({
            from: () => ({
              innerJoin: () => ({ innerJoin: () => ({ where: async () => [] }) }),
              where: async () => [],
            }),
          }),
        };
        return fn(tx);
      },
    };
    const redis = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
    };
    const repository = new EtaQueueRepository(db as never, redis);
    const { state } = await repository.load('tenant');
    expect(state.activeStations).toBe(1);
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
