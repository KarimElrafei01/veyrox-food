import {
  applyEtaQueueEvent,
  type EtaQueueRepository,
} from '../infrastructure/eta-queue-repository.js';
import type { KitchenStateRepository } from '../infrastructure/kitchen-state-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';

export class SetActiveStations {
  constructor(
    private readonly repository: KitchenStateRepository,
    private readonly etaQueue: EtaQueueRepository,
    private readonly sseHub: Pick<SseHub, 'publish'>,
  ) {}

  async execute(input: {
    tenantId: string;
    activeStations: number;
    staffId: string;
    now: Date;
  }): Promise<{ activeStations: number; updatedAt: Date }> {
    const result = await this.repository.setActiveStations(input);

    // The same cached value F1.4's ETA calc and the board's own activeStations
    // field both read (accept-order.ts, load-board-snapshot.ts) - kitchen_state
    // is the durable source of truth surviving cache eviction, but every reader
    // still goes through this one cache, not a second value invented here.
    const queue = await this.etaQueue.load(input.tenantId);
    await this.etaQueue.replace(
      input.tenantId,
      applyEtaQueueEvent(
        queue.state,
        { type: 'stations', activeStations: input.activeStations },
        input.now,
      ),
    );

    // No order_events row exists for this - kitchen_state.changed carries no
    // id and is therefore live-only, never replayed (see SsePublishedEvent's
    // doc comment for why that's the correct tradeoff here).
    this.sseHub.publish(input.tenantId, {
      event: 'kitchen_state.changed',
      data: { activeStations: result.activeStations, updatedAt: result.updatedAt.toISOString() },
    });

    return result;
  }
}
