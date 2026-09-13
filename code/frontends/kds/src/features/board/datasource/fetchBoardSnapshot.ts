import { boardSnapshotResponse, type BoardSnapshotResponse } from '@veyroxai/contracts';
import type { HttpClient } from '@veyroxai/api-client';

/** GET /staff/board - full snapshot, first load and gap-cap resync only, never
 *  polled (ADR-0005). */
export function fetchBoardSnapshot(client: HttpClient): Promise<BoardSnapshotResponse> {
  return client.get('/staff/board', boardSnapshotResponse);
}
