import type { BoardSnapshotResponse, OrderTicket } from '@veyroxai/contracts';
import type { BoardStreamEvent } from '../datasource/subscribeToBoardStream.js';

export interface BoardColumns {
  new: OrderTicket[];
  received: OrderTicket[];
  preparing: OrderTicket[];
  ready: OrderTicket[];
}

export type BoardMetrics = BoardSnapshotResponse['metrics'];
export type ColumnKey = keyof BoardColumns;

export interface BoardState {
  asOfEventId: string | null;
  activeStations: number;
  columns: BoardColumns;
  metrics: BoardMetrics;
}

export function boardStateFromSnapshot(
  snapshot: Omit<BoardSnapshotResponse, 'traceId'>,
): BoardState {
  return {
    asOfEventId: snapshot.asOfEventId,
    activeStations: snapshot.activeStations,
    columns: snapshot.columns,
    metrics: snapshot.metrics,
  };
}

/** New/unaccepted tickets land on New regardless of channel (FR-3.1/FR-3.11 -
 *  WhatsApp's `placed` and Till's `pending` share one Accept/Reject gate).
 *  A status with no column (rejected/voided/abandoned/collected) has already
 *  moved money or materials for real and falls off the live board entirely -
 *  the same set order-state-machine.ts's isRevertEligible protects. */
function columnForStatus(status: string): ColumnKey | null {
  if (status === 'placed' || status === 'pending') return 'new';
  if (status === 'received') return 'received';
  if (status === 'preparing') return 'preparing';
  if (status === 'ready') return 'ready';
  return null;
}

function removeFromAllColumns(columns: BoardColumns, orderId: string): BoardColumns {
  return {
    new: columns.new.filter((ticket) => ticket.orderId !== orderId),
    received: columns.received.filter((ticket) => ticket.orderId !== orderId),
    preparing: columns.preparing.filter((ticket) => ticket.orderId !== orderId),
    ready: columns.ready.filter((ticket) => ticket.orderId !== orderId),
  };
}

/** Ascending by placedAt, matching the backend's own `ORDER BY placed_at ASC`
 *  (kitchen-order-repository.ts) - a streamed patch must not silently
 *  reorder a column relative to what a fresh snapshot would show. */
function insertSorted(tickets: OrderTicket[], ticket: OrderTicket): OrderTicket[] {
  const index = tickets.findIndex((existing) => existing.placedAt > ticket.placedAt);
  if (index === -1) return [...tickets, ticket];
  return [...tickets.slice(0, index), ticket, ...tickets.slice(index)];
}

function mapAllColumns(
  columns: BoardColumns,
  fn: (ticket: OrderTicket) => OrderTicket,
): BoardColumns {
  return {
    new: columns.new.map(fn),
    received: columns.received.map(fn),
    preparing: columns.preparing.map(fn),
    ready: columns.ready.map(fn),
  };
}

/** Folds one parsed SSE frame into board state - pure, no I/O, so every
 *  transition this feature can receive is unit-testable without a real
 *  connection (ADR-0018's usecases/ layer). */
export function applyStreamEvent(state: BoardState, event: BoardStreamEvent): BoardState {
  switch (event.type) {
    case 'order.transitioned': {
      const withoutOrder = removeFromAllColumns(state.columns, event.orderId);
      const column = columnForStatus(event.order.status);
      const columns = column
        ? { ...withoutOrder, [column]: insertSorted(withoutOrder[column], event.order) }
        : withoutOrder;
      return { ...state, columns };
    }
    case 'order.item_ticked': {
      const columns = mapAllColumns(state.columns, (ticket) =>
        ticket.orderId === event.orderId
          ? {
              ...ticket,
              items: ticket.items.map((item) =>
                item.orderItemId === event.orderItemId ? { ...item, ticked: event.ticked } : item,
              ),
            }
          : ticket,
      );
      return { ...state, columns };
    }
    case 'kitchen_state.changed':
      return { ...state, activeStations: event.activeStations };
    case 'board.snapshot':
      return boardStateFromSnapshot(event);
    default:
      return state;
  }
}
