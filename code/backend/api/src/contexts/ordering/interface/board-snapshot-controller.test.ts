import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt, mintPinActionToken } from '../../identity/domain/index.js';
import type { LoadBoardSnapshot } from '../application/load-board-snapshot.js';

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

function harness(execute?: LoadBoardSnapshot['execute']) {
  const board = {
    execute:
      execute ??
      vi.fn(async () => ({
        asOfEventId: 'e5',
        activeStations: 2,
        columns: { new: [], received: [], preparing: [], ready: [] },
        metrics: {
          activeTicketCount: 0,
          delayedOver15mCount: 0,
          avgTurnaroundSeconds: 0,
          railCapacity: { used: 0, slots: 16 },
          peakVelocityPerHour: 0,
        },
      })),
  } as unknown as LoadBoardSnapshot;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    boardSnapshot: { board, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY] },
  }).then((app) => ({ app, board }));
}

describe('GET /staff/board', () => {
  it('rejects a request with no staff auth', async () => {
    const { app } = await harness();
    const response = await app.inject({ method: 'GET', url: '/staff/board' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('returns the full snapshot scoped to the caller tenant', async () => {
    const { app, board } = await harness();
    const response = await app.inject({ method: 'GET', url: '/staff/board', headers: headers() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ asOfEventId: 'e5', activeStations: 2 });
    expect(board.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1' }));
  });
});
