import { estimateEta, previewPoints, toMinor, type LoyaltyTier } from '@veyroxai/domain';
import type { PlaceOrderRequest } from '@veyroxai/contracts';
import type {
  OrderPlacementRepository,
  PlacedOrder,
} from '../infrastructure/order-placement-repository.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import type { SseHub } from '../infrastructure/sse-hub.js';
import type { QuoteOrder } from './quote-order.js';
import type { PricedForQuote } from '../interface/quote-body.js';
import { recordEtaRead, type EtaMetricSink } from './eta-metrics.js';
import { publishOrderTransitioned } from './sse-events.js';

export class ItemUnavailable extends Error {
  constructor(readonly unavailable: readonly { menuItemId: string; modifierOptionId?: string }[]) {
    super('One or more items are unavailable.');
    this.name = 'ItemUnavailable';
  }
}

/** Carries the fresh quote so the controller can return it inline (F1.6 §2). */
export class PriceChanged extends Error {
  constructor(readonly priced: PricedForQuote) {
    super('The price changed while the customer was ordering.');
    this.name = 'PriceChanged';
  }
}

export class MinimumOrderValue extends Error {
  constructor(readonly minOrderValueMinor: number) {
    super('The order is below the minimum value.');
    this.name = 'MinimumOrderValue';
  }
}

export class PlaceOrder {
  constructor(
    private readonly quote: QuoteOrder,
    private readonly orders: OrderPlacementRepository,
    private readonly etaQueue: EtaQueueRepository,
    private readonly etaMetrics: EtaMetricSink,
    private readonly kitchenOrders: KitchenOrderRepository,
    private readonly sseHub: Pick<SseHub, 'publish'>,
  ) {}

  async execute(input: {
    tenantId: string;
    customerId: string;
    menuVersionId: string;
    tier: LoyaltyTier;
    minOrderValueMinor: number;
    idempotencyKey: string;
    traceId: string;
    request: PlaceOrderRequest;
  }): Promise<{ order: PlacedOrder; response: unknown; replayed: boolean }> {
    const replay = await this.orders.findReplay(input.tenantId, input.idempotencyKey);
    if (replay) return { order: replay.order, response: replay.response, replayed: true };

    const priced = await this.quote.execute({
      tenantId: input.tenantId,
      menuVersionId: input.menuVersionId,
      tier: input.tier,
      items: input.request.items,
    });

    if (priced.unavailable.length) throw new ItemUnavailable(priced.unavailable);
    if (
      input.request.expectedTotalMinor !== undefined &&
      input.request.expectedTotalMinor !== priced.totalMinor
    )
      throw new PriceChanged(priced);
    if (priced.totalMinor <= 0 || priced.totalMinor < input.minOrderValueMinor)
      throw new MinimumOrderValue(input.minOrderValueMinor);

    const pointsToEarn = previewPoints(toMinor(priced.totalMinor), input.tier).pointsToEarn;

    // F1.6 §2: the *estimate* is populated at placement (same numbers a quote would
    // show right now) so the customer sees "~8-12 min" immediately — only the
    // wall-clock promise waits for a barista to accept. Same queue snapshot the
    // quote endpoint uses, so a customer never sees quote and placement disagree.
    const queue = await this.etaQueue.load(input.tenantId);
    // Same signal the quote endpoint emits (F1.4 §Failure mode) — a degraded read
    // here means this café got the pessimistic ×1.5 fallback on its *placement*
    // promise, not just its quote, which is worth paging on if it persists.
    recordEtaRead(this.etaMetrics, queue.source, queue.state.tickets.length);
    const estimate = estimateEta(
      priced.etaItems,
      queue.state.tickets,
      input.tier,
      queue.state.activeStations,
      new Date(),
      queue.source === 'degraded' ? 1.5 : 1.25,
    );

    const placed = await this.orders.place({
      tenantId: input.tenantId,
      customerId: input.customerId,
      menuVersionId: input.menuVersionId,
      idempotencyKey: input.idempotencyKey,
      cart: priced,
      tableLabel: input.request.tableLabel ?? null,
      customerNote: input.request.customerNote ?? null,
      responseSeed: {
        payAt: 'counter',
        eta: {
          lowerMinutes: estimate.lowerMinutes,
          upperMinutes: estimate.upperMinutes,
          startsOnAccept: true,
          promisedLowerAt: null,
          promisedUpperAt: null,
        },
        loyalty: { pointsToEarn },
        traceId: input.traceId,
      },
    });

    // ADR-0005: a new order's null->placed transition is itself a "KDS status
    // change" and must propagate the same as accept/advance/revert do - the
    // New column is otherwise invisible to a connected KDS until it reloads.
    // Skipped on the race-losing side of a concurrent duplicate placement
    // (placed.replayed): there is no second event row to describe, and the
    // winning request already published this exact order.
    if (!placed.replayed) {
      const ticket = await this.kitchenOrders.loadTicketById(
        input.tenantId,
        placed.order.orderId,
        new Date(),
      );
      if (ticket)
        publishOrderTransitioned(
          this.sseHub,
          input.tenantId,
          placed.order.orderId,
          placed.event,
          ticket,
        );
    }

    return { order: placed.order, response: placed.response, replayed: placed.replayed };
  }
}
