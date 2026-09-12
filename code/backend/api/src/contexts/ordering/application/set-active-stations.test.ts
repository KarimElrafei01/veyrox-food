import { describe, expect, it, vi } from 'vitest';
import { SetActiveStations } from './set-active-stations.js';
import type { KitchenStateRepository } from '../infrastructure/kitchen-state-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';

const now = new Date('2026-09-06T12:05:00.000Z');

function subject() {
  const setActiveStations = vi.fn(async () => ({ activeStations: 3, updatedAt: now }));
  const repository = { setActiveStations } as unknown as KitchenStateRepository;
  const replace = vi.fn((..._args: Parameters<EtaQueueRepository['replace']>) => Promise.resolve());
  const etaQueue = {
    load: vi.fn(async () => ({
      state: { activeStations: 1, tickets: [], updatedAt: now.toISOString() },
      source: 'postgres' as const,
    })),
    replace,
  } as unknown as EtaQueueRepository;
  const publish = vi.fn();
  const sseHub = { publish };
  return { useCase: new SetActiveStations(repository, etaQueue, sseHub), replace, publish };
}

describe('SetActiveStations', () => {
  it('updates the live ETA queue cache with the new station count', async () => {
    const { useCase, replace } = subject();
    await useCase.execute({ tenantId: 't1', activeStations: 3, staffId: 's1', now });
    const [, nextState] = vi.mocked(replace).mock.calls[0] as [string, { activeStations: number }];
    expect(nextState.activeStations).toBe(3);
  });

  it('publishes kitchen_state.changed with no id (live-only, never replayed)', async () => {
    const { useCase, publish } = subject();
    await useCase.execute({ tenantId: 't1', activeStations: 3, staffId: 's1', now });
    expect(publish).toHaveBeenCalledWith('t1', {
      event: 'kitchen_state.changed',
      data: { activeStations: 3, updatedAt: now.toISOString() },
    });
  });
});
