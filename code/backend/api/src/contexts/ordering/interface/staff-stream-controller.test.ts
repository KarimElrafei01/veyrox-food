import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt } from '../../identity/domain/index.js';
import type { StreamBoardEvents } from '../application/stream-board.js';

const KEY = 'device-key';

function harness() {
  // The success path (a connection that stays open and receives pushed
  // events) is deliberately not exercised here via inject() - a hijacked SSE
  // response never terminates, and inject() waits for the response to end.
  // That behavior needs a real running server and client, per ADR-0005's own
  // "drop the connection mid-stream" integration test (task #11).
  const stream = { connect: async () => () => undefined } as unknown as StreamBoardEvents;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    staffStream: { stream, deviceKeys: [KEY] },
  });
}

describe('GET /staff/stream auth', () => {
  it('rejects a missing deviceToken with 400 (schema validation)', async () => {
    const app = await harness();
    const response = await app.inject({ method: 'GET', url: '/staff/stream' });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an invalid deviceToken with 401 SESSION_INVALID', async () => {
    const app = await harness();
    const response = await app.inject({
      method: 'GET',
      url: '/staff/stream?deviceToken=not-a-real-token',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('rejects an expired deviceToken with 401 SESSION_EXPIRED', async () => {
    const app = await harness();
    const expired = mintDeviceJwt(
      {
        tenantId: 't1',
        deviceId: 'd1',
        deviceKind: 'kds',
        issuedAt: 0,
        expiresAt: Math.floor(Date.now() / 1000) - 10,
      },
      KEY,
    );
    const response = await app.inject({
      method: 'GET',
      url: `/staff/stream?deviceToken=${expired}`,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});
