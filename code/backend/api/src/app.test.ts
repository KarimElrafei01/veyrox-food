import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const healthy = {
  pingPostgres: async () => true,
  pingRedis: async () => true,
};

describe('health routes', () => {
  it('reports live', async () => {
    const app = await buildApp(healthy);
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('reports ok when dependencies are up', async () => {
    const app = await buildApp(healthy);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks).toEqual({ postgres: true, redis: true });
    await app.close();
  });

  it('reports 503 when a dependency is down', async () => {
    const app = await buildApp({ ...healthy, pingRedis: async () => false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('degraded');
    await app.close();
  });

  it('returns a problem document for an unknown route', async () => {
    const app = await buildApp(healthy);
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: expect.any(String), traceId: expect.any(String) });
    await app.close();
  });
});
