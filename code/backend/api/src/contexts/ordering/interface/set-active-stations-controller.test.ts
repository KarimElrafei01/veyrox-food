import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt, mintPinActionToken } from '../../identity/domain/index.js';
import type { SetActiveStations } from '../application/set-active-stations.js';

const DEVICE_KEY = 'device-key';
const PIN_KEY = 'pin-key';

function headers() {
  const now = Math.floor(Date.now() / 1000);
  const deviceToken = mintDeviceJwt(
    { tenantId: 't1', deviceId: 'd1', deviceKind: 'kds', issuedAt: now, expiresAt: now + 3600 },
    DEVICE_KEY,
  );
  const pinToken = mintPinActionToken(
    { tenantId: 't1', deviceId: 'd1', staffId: 's1', issuedAt: now, expiresAt: now + 900 },
    PIN_KEY,
  );
  return { authorization: `Bearer ${deviceToken}`, 'x-staff-pin-token': pinToken };
}

function harness(execute?: SetActiveStations['execute']) {
  const setActiveStations = {
    execute: execute ?? vi.fn(async () => ({ activeStations: 3, updatedAt: new Date(0) })),
  } as unknown as SetActiveStations;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    setActiveStations: { setActiveStations, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY] },
  }).then((app) => ({ app, setActiveStations }));
}

describe('PUT /staff/kitchen-state/stations', () => {
  it('rejects a request with no staff auth', async () => {
    const { app } = await harness();
    const response = await app.inject({
      method: 'PUT',
      url: '/staff/kitchen-state/stations',
      payload: { activeStations: 3, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('sets the count and returns it with an ISO updatedAt', async () => {
    const { app, setActiveStations } = await harness();
    const response = await app.inject({
      method: 'PUT',
      url: '/staff/kitchen-state/stations',
      headers: headers(),
      payload: { activeStations: 3, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      activeStations: 3,
      updatedAt: new Date(0).toISOString(),
    });
    expect(setActiveStations.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', activeStations: 3, staffId: 's1' }),
    );
  });

  it('rejects a station count outside the 1-12 CHECK-constrained range', async () => {
    const { app } = await harness();
    const response = await app.inject({
      method: 'PUT',
      url: '/staff/kitchen-state/stations',
      headers: headers(),
      payload: { activeStations: 13, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(400);
  });
});
