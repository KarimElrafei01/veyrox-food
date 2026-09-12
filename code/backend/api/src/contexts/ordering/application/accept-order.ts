import { estimateEta } from '@veyroxai/domain';
import type { OrderTicket } from '@veyroxai/contracts';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import { applyEtaQueueEvent } from '../infrastructure/eta-queue-repository.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { OrderNotFound } from '../infrastructure/kitchen-order-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';
import { recordEtaRead, type EtaMetricSink } from './eta-metrics.js';
import { publishOrderTransitioned } from './sse-events.js';

export { OrderNotFound };

export class AcceptOrder {
  constructor(
    private readonly repository: KitchenOrderRepository,
    private readonly etaQueue: EtaQueueRepository,
    private readonly etaMetrics: EtaMetricSink,
    private readonly sseHub: Pick<SseHub, 'publish'>,
  ) {}

  async execute(input: {
    tenantId: string;
    orderId: string;
    idempotencyKey: string;
    staffId: string;
    now: Date;
  }): Promise<{ ticket: OrderTicket; replayed: boolean }> {
    const cart = await this.repository.loadCartForEta(input.tenantId, input.orderId);
    if (!cart) throw new OrderNotFound();

    // F1.4's ETA calc, evaluated fresh at Accept (backend doc §2.1 step 4) - the
    // same estimator and live queue snapshot the quote/placement/status
    // endpoints already use, so this promise never disagrees with what the
    // customer webview showed a moment earlier.
    const queue = await this.etaQueue.load(input.tenantId);
    recordEtaRead(this.etaMetrics, queue.source, queue.state.tickets.length);
    const estimate = estimateEta(
      cart.items,
      queue.state.tickets,
      cart.customerTier,
      queue.state.activeStations,
      input.now,
      queue.source === 'degraded' ? 1.5 : 1.25,
    );

    const result = await this.repository.accept({
      tenantId: input.tenantId,
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      staffId: input.staffId,
      now: input.now,
      etaMinutes: { lowerMinutes: estimate.lowerMinutes, upperMinutes: estimate.upperMinutes },
    });

    // Post-commit cache update, not a side effect inside the transaction (ADR-0005
    // "publish after commit, never inline") - a rolled-back Accept must never
    // advance the live queue any KDS/webview reads next.
    if (!result.replayed) {
      const prepSeconds = Math.max(0, ...cart.items.map((item) => item.prepSeconds));
      const nextState = applyEtaQueueEvent(
        queue.state,
        { type: 'accepted', orderId: input.orderId, prepSeconds, tier: cart.customerTier },
        input.now,
      );
      await this.etaQueue.replace(input.tenantId, nextState);
    }

    if (!result.replayed && result.event)
      publishOrderTransitioned(
        this.sseHub,
        input.tenantId,
        input.orderId,
        result.event,
        result.ticket,
      );

    return result;
  }
}
