import { previewPoints, toMinor, type LoyaltyTier } from '@veyroxai/domain';
import type { PlaceOrderRequest } from '@veyroxai/contracts';
import type {
  OrderPlacementRepository,
  PlacedOrder,
} from '../infrastructure/order-placement-repository.js';
import type { QuoteOrder } from './quote-order.js';
import type { PricedForQuote } from '../interface/quote-body.js';

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

/** F1.6 §2: the ETA clock does not start until a barista accepts, so placement
 *  always returns an empty range. Frozen here so the stored replay body is stable. */
const ETA_AT_PLACEMENT = {
  lowerMinutes: null,
  upperMinutes: null,
  startsOnAccept: true,
  promisedLowerAt: null,
  promisedUpperAt: null,
} as const;

export class PlaceOrder {
  constructor(
    private readonly quote: QuoteOrder,
    private readonly orders: OrderPlacementRepository,
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
    const { order, response } = await this.orders.place({
      tenantId: input.tenantId,
      customerId: input.customerId,
      menuVersionId: input.menuVersionId,
      idempotencyKey: input.idempotencyKey,
      cart: priced,
      tableLabel: input.request.tableLabel ?? null,
      customerNote: input.request.customerNote ?? null,
      responseSeed: {
        payAt: 'counter',
        eta: ETA_AT_PLACEMENT,
        loyalty: { pointsToEarn },
        traceId: input.traceId,
      },
    });
    return { order, response, replayed: false };
  }
}
