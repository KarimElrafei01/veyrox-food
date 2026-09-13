import { afterEach, describe, expect, it } from 'vitest';
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

// reply.hijack() (used once auth passes, so the connection stays open for
// pushed events) hands the raw response to us before any of Fastify's own
// onSend hooks - including @fastify/cors's - ever run, so this one route
// needs its own CORS header written by hand (staff-stream-controller.ts).
// inject() waits for the response to end, which a hijacked SSE stream never
// does, so these use a real listening server and fetch() instead - the
// promise resolves once headers arrive, before the (never-ending) body.
describe('GET /staff/stream CORS (bypasses onSend, so it is not covered by @fastify/cors)', () => {
  const originalCorsOrigins = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (originalCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalCorsOrigins;
  });

  function validDeviceToken() {
    const now = Math.floor(Date.now() / 1000);
    return mintDeviceJwt(
      { tenantId: 't1', deviceId: 'd1', deviceKind: 'kds', issuedAt: now, expiresAt: now + 3600 },
      KEY,
    );
  }

  async function openStream(app: Awaited<ReturnType<typeof harness>>, origin: string) {
    await app.listen({ port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const controller = new AbortController();
    try {
      return {
        response: await fetch(
          `http://127.0.0.1:${port}/staff/stream?deviceToken=${validDeviceToken()}`,
          { headers: { origin }, signal: controller.signal },
        ),
        close: () => controller.abort(),
      };
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  it('reflects the request Origin when CORS_ORIGINS is unset (dev default)', async () => {
    delete process.env.CORS_ORIGINS;
    const app = await harness();
    const { response, close } = await openStream(app, 'http://localhost:3003');
    try {
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3003');
    } finally {
      close();
      await app.close();
    }
  });

  it('reflects an allow-listed Origin when CORS_ORIGINS is set', async () => {
    process.env.CORS_ORIGINS = 'https://ops.veyroxai.com,https://kds.veyroxai.com';
    const app = await harness();
    const { response, close } = await openStream(app, 'https://ops.veyroxai.com');
    try {
      expect(response.headers.get('access-control-allow-origin')).toBe('https://ops.veyroxai.com');
    } finally {
      close();
      await app.close();
    }
  });

  it('omits the header for an Origin not on the CORS_ORIGINS allow-list', async () => {
    process.env.CORS_ORIGINS = 'https://ops.veyroxai.com';
    const app = await harness();
    const { response, close } = await openStream(app, 'https://evil.example');
    try {
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      close();
      await app.close();
    }
  });
});
