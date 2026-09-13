import type { HttpClient } from '@veyroxai/api-client';
import type {
  OrderTicket,
  TickItemResponse,
  BoardSnapshotResponse,
  SetActiveStationsResponse,
} from '@veyroxai/contracts';
import { fetchBoardSnapshot } from '../datasource/fetchBoardSnapshot.js';
import { advanceOrder } from '../datasource/advanceOrder.js';
import { tickItem } from '../datasource/tickItem.js';
import { revertOrder } from '../datasource/revertOrder.js';
import { setActiveStations } from '../datasource/setActiveStations.js';

/** Thin wrapper over the board's datasource calls (ADR-0018) - no retry/fallback
 *  logic yet, since the offline outbox this pass explicitly defers (F2 frontend
 *  doc's 2026-09-12 scope-correction note) is exactly where that would live. */
export interface BoardRepo {
  fetchSnapshot(): Promise<BoardSnapshotResponse>;
  advance(
    orderId: string,
    toStatus: 'preparing' | 'ready',
    idempotencyKey: string,
  ): Promise<OrderTicket>;
  tick(
    orderId: string,
    orderItemId: string,
    ticked: boolean,
    idempotencyKey: string,
  ): Promise<TickItemResponse>;
  revert(orderId: string, idempotencyKey: string): Promise<OrderTicket>;
  setStations(activeStations: number, idempotencyKey: string): Promise<SetActiveStationsResponse>;
}

export function createBoardRepo(client: HttpClient): BoardRepo {
  return {
    fetchSnapshot: () => fetchBoardSnapshot(client),
    advance: (orderId, toStatus, idempotencyKey) =>
      advanceOrder(client, orderId, toStatus, idempotencyKey),
    tick: (orderId, orderItemId, ticked, idempotencyKey) =>
      tickItem(client, orderId, orderItemId, ticked, idempotencyKey),
    revert: (orderId, idempotencyKey) => revertOrder(client, orderId, idempotencyKey),
    setStations: (activeStations, idempotencyKey) =>
      setActiveStations(client, activeStations, idempotencyKey),
  };
}
