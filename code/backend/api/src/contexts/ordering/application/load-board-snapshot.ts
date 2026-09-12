import type { BoardSnapshotResponse } from '@veyroxai/contracts';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';

export class LoadBoardSnapshot {
  constructor(
    private readonly repository: KitchenOrderRepository,
    private readonly etaQueue: EtaQueueRepository,
  ) {}

  async execute(input: {
    tenantId: string;
    now: Date;
  }): Promise<Omit<BoardSnapshotResponse, 'traceId'>> {
    // Same source F1.4's ETA calc already reads (eta-queue-repository.ts) - one
    // activeStations value, not a second one this endpoint invents.
    const [snapshot, queue] = await Promise.all([
      this.repository.loadBoardSnapshot(input),
      this.etaQueue.load(input.tenantId),
    ]);
    return { ...snapshot, activeStations: queue.state.activeStations };
  }
}
