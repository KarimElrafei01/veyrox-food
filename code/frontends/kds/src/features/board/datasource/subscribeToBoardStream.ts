import {
  boardSnapshotStreamEvent,
  kitchenStateChangedEvent,
  orderItemTickedEvent,
  orderTransitionedEvent,
  type BoardSnapshotStreamEvent,
  type KitchenStateChangedEvent,
  type OrderItemTickedEvent,
  type OrderTransitionedEvent,
} from '@veyroxai/contracts';
import { connectStaffStream, type StaffStream } from '@veyroxai/ops-core';

export type BoardStreamEvent =
  | ({ type: 'order.transitioned' } & OrderTransitionedEvent)
  | ({ type: 'order.item_ticked' } & OrderItemTickedEvent)
  | ({ type: 'kitchen_state.changed' } & KitchenStateChangedEvent)
  | ({ type: 'board.snapshot' } & BoardSnapshotStreamEvent);

const EVENT_NAMES = [
  'heartbeat',
  'order.transitioned',
  'order.item_ticked',
  'kitchen_state.changed',
  'board.snapshot',
] as const;

/** Parses every raw SSE frame against its contract schema before it ever
 *  reaches the board reducer (ADR-0018: schema parsing is a datasource job) -
 *  a malformed frame is dropped with a console warning rather than corrupting
 *  live board state or crashing the tab a barista is standing in front of. */
export function subscribeToBoardStream(options: {
  baseUrl: string;
  deviceToken: string;
  lastEventId: string | null;
  onEvent: (event: BoardStreamEvent) => void;
  onStaleChange: (stale: boolean) => void;
}): StaffStream {
  return connectStaffStream({
    baseUrl: options.baseUrl,
    deviceToken: options.deviceToken,
    lastEventId: options.lastEventId,
    eventNames: EVENT_NAMES,
    onStaleChange: options.onStaleChange,
    onEvent: (frame) => {
      if (frame.event === 'heartbeat') return; // liveness only, no board effect
      const parsed = parseFrame(frame.event, frame.data);
      if (!parsed) {
        console.warn(`Dropped malformed "${frame.event}" SSE frame`, frame.data);
        return;
      }
      options.onEvent(parsed);
    },
  });
}

function parseFrame(event: string, data: unknown): BoardStreamEvent | null {
  switch (event) {
    case 'order.transitioned': {
      const result = orderTransitionedEvent.safeParse(data);
      return result.success ? { type: 'order.transitioned', ...result.data } : null;
    }
    case 'order.item_ticked': {
      const result = orderItemTickedEvent.safeParse(data);
      return result.success ? { type: 'order.item_ticked', ...result.data } : null;
    }
    case 'kitchen_state.changed': {
      const result = kitchenStateChangedEvent.safeParse(data);
      return result.success ? { type: 'kitchen_state.changed', ...result.data } : null;
    }
    case 'board.snapshot': {
      const result = boardSnapshotStreamEvent.safeParse(data);
      return result.success ? { type: 'board.snapshot', ...result.data } : null;
    }
    default:
      return null;
  }
}
