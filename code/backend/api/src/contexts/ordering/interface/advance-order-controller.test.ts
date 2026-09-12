import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt, mintPinActionToken } from '../../identity/domain/index.js';
import type { AdvanceOrder } from '../application/advance-order.js';
import { OrderNotFound } from '../application/advance-order.js';
import { InvalidTransition } from '../infrastructure/kitchen-order-repository.js';

const DEVICE_KEY = 'device-key';
const PIN_KEY = 'pin-key';
const ORDER_ID = '01930b2e-0000-7000-8000-000000000001';

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

function harness(execute?: AdvanceOrder['execute']) {
  const emit = vi.fn(async () => undefined);
  const advance = { execute: execute ?? vi.fn() } as unknown as AdvanceOrder;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    advanceOrder: { advance, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY], emit },
  }).then((app) => ({ app, advance, emit }));
}

describe('POST /orders/:id/advance', () => {
  it('rejects a request with no staff auth', async () => {
    const { app } = await harness();
    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/advance`,
      payload: { toStatus: 'preparing', idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('advances to ready and fires the commit-hook side effect that enqueues the Guest Notified message', async () => {
    const execute = vi.fn(async () => ({
      ticket: { orderId: ORDER_ID, status: 'ready' },
      replayed: false,
    })) as unknown as AdvanceOrder['execute'];
    const { app, emit } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/advance`,
      headers: headers(),
      payload: { toStatus: 'ready', idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('false');
    expect(response.json()).toMatchObject({ orderId: ORDER_ID, status: 'ready' });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('a double-tap into the same status replays rather than re-firing the side effect', async () => {
    const execute = vi.fn(async () => ({
      ticket: { orderId: ORDER_ID, status: 'preparing' },
      replayed: true,
    })) as unknown as AdvanceOrder['execute'];
    const { app, emit } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/advance`,
      headers: headers(),
      payload: { toStatus: 'preparing', idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(emit).not.toHaveBeenCalled();
  });

  it('maps InvalidTransition to 409 with allowedTransitions', async () => {
    const execute = vi.fn(async () => {
      throw new InvalidTransition(['voided', 'abandoned']);
    }) as unknown as AdvanceOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/advance`,
      headers: headers(),
      payload: { toStatus: 'ready', idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'INVALID_TRANSITION',
      allowedTransitions: ['voided', 'abandoned'],
    });
  });

  it('maps OrderNotFound to 404', async () => {
    const execute = vi.fn(async () => {
      throw new OrderNotFound();
    }) as unknown as AdvanceOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/advance`,
      headers: headers(),
      payload: { toStatus: 'preparing', idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});
