import type { KitchenOrderRepository } from '../infrastructure/kitchen-order-repository.js';
import { formatSseEvent, type SseHub, type SseSubscriber } from '../infrastructure/sse-hub.js';
import type { LoadBoardSnapshot } from './load-board-snapshot.js';

// ADR-0005 requires a gap cap ("do not replay 3,000 events... send one full
// board snapshot") without naming a number. 200 is chosen generously above a
// normal shift's event volume (a handful of mutations per order, a rail of
// ~16 orders) so an ordinary wifi blip still gets real incremental replay,
// and only a genuinely long outage triggers a full resync.
const GAP_CAP = 200;

export class StreamBoardEvents {
  constructor(
    private readonly repository: KitchenOrderRepository,
    private readonly board: LoadBoardSnapshot,
    private readonly sseHub: Pick<SseHub, 'subscribe'>,
  ) {}

  /**
   * Subscribes first, then replays (or gap-cap-resyncs) strictly up to the
   * event id captured at that moment - anything committed after is guaranteed
   * to arrive via the live subscription already in place, so a connecting
   * client can never miss an event. A live event landing in the narrow replay
   * window may be written twice, which is safe: the client's reducer patches
   * by event id and by order id (ADR-0005 / ADR-0022), so a duplicate is a
   * no-op, never a corruption - the one failure mode this ordering forecloses
   * is a *missed* event, which a snapshot-then-subscribe ordering could not.
   */
  async connect(input: {
    tenantId: string;
    lastEventId: string | null;
    now: Date;
    subscriber: SseSubscriber;
  }): Promise<() => void> {
    const unsubscribe = this.sseHub.subscribe(input.tenantId, input.subscriber);
    const asOfEventId = await this.repository.currentMaxEventId(input.tenantId);

    // No prior position to resume from - either the very first connection
    // (the client's own GET /staff/board already gave it current state, per
    // frontend doc §1.6) or a brand-new tenant with no events yet.
    if (!input.lastEventId || !asOfEventId) return unsubscribe;

    const events = await this.repository.replayEvents({
      tenantId: input.tenantId,
      afterEventId: input.lastEventId,
      upToEventId: asOfEventId,
      limit: GAP_CAP + 1,
    });

    if (events.length > GAP_CAP) {
      const snapshot = await this.board.execute({ tenantId: input.tenantId, now: input.now });
      input.subscriber.write(
        formatSseEvent({ id: asOfEventId, event: 'board.snapshot', data: snapshot }),
      );
      return unsubscribe;
    }

    const ticketByOrderId = new Map<
      string,
      Awaited<ReturnType<typeof this.repository.loadTicketById>>
    >();
    for (const event of events) {
      const metadata =
        typeof event.metadata === 'object' && event.metadata !== null
          ? (event.metadata as Record<string, unknown>)
          : null;

      if (metadata?.action === 'item_tick') {
        input.subscriber.write(
          formatSseEvent({
            id: event.id,
            event: 'order.item_ticked',
            data: {
              orderId: event.orderId,
              orderItemId: metadata.orderItemId,
              ticked: metadata.ticked,
              occurredAt: event.createdAt.toISOString(),
            },
          }),
        );
        continue;
      }

      if (!ticketByOrderId.has(event.orderId))
        ticketByOrderId.set(
          event.orderId,
          await this.repository.loadTicketById(input.tenantId, event.orderId, input.now),
        );
      const ticket = ticketByOrderId.get(event.orderId);
      if (!ticket) continue; // order no longer resolvable - nothing left to describe

      input.subscriber.write(
        formatSseEvent({
          id: event.id,
          event: 'order.transitioned',
          data: {
            orderId: event.orderId,
            fromStatus: event.fromStatus,
            toStatus: event.toStatus,
            actorType: event.actorType,
            occurredAt: event.createdAt.toISOString(),
            order: ticket,
          },
        }),
      );
    }

    return unsubscribe;
  }
}
