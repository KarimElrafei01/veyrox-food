import { setActiveStationsResponse, type SetActiveStationsResponse } from '@veyroxai/contracts';
import type { HttpClient } from '@veyroxai/api-client';

/** PUT /staff/kitchen-state/stations - header stepper (§1.1, FR-3.10). */
export function setActiveStations(
  client: HttpClient,
  activeStations: number,
  idempotencyKey: string,
): Promise<SetActiveStationsResponse> {
  return client.put('/staff/kitchen-state/stations', {
    body: { activeStations, idempotencyKey },
    schema: setActiveStationsResponse,
  });
}
