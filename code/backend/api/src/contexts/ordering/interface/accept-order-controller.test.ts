import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt, mintPinActionToken } from '../../identity/domain/index.js';
import type { AcceptOrder } from '../application/accept-order.js';
import { OrderNotFound } from '../application/accept-order.js';
import {
  InvalidTransition,
  ItemNoLongerAvailable,
} from '../infrastructure/kitchen-order-repository.js';

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

function harness(execute?: AcceptOrder['execute']) {
  const emit = vi.fn(async () => undefined);
  const accept = { execute: execute ?? vi.fn() } as unknown as AcceptOrder;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    acceptOrder: { accept, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY], emit },
  }).then((app) => ({ app, accept, emit }));
}

describe('POST /orders/:id/accept', () => {
  it('rejects a request with no staff auth', async () => {
    const { app } = await harness();
    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/accept`,
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('accepts, emits the commit-hook side effect once, and echoes Idempotency-Replayed: false', async () => {
    const execute = vi.fn(async () => ({
      ticket: { orderId: ORDER_ID, status: 'received' },
      replayed: false,
    })) as unknown as AcceptOrder['execute'];
    const { app, emit } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/accept`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('false');
    expect(response.json()).toMatchObject({ orderId: ORDER_ID, status: 'received' });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire the commit-hook side effect on a replay', async () => {
    const execute = vi.fn(async () => ({
      ticket: { orderId: ORDER_ID, status: 'received' },
      replayed: true,
    })) as unknown as AcceptOrder['execute'];
    const { app, emit } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/accept`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(emit).not.toHaveBeenCalled();
  });

  it('maps ItemNoLongerAvailable to 409 with the offending line(s)', async () => {
    const unavailable = [{ menuItemId: 'm1' }];
    const execute = vi.fn(async () => {
      throw new ItemNoLongerAvailable(unavailable);
    }) as unknown as AcceptOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/accept`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'ITEM_NO_LONGER_AVAILABLE', unavailable });
  });

  it('maps InvalidTransition to 409 with allowedTransitions', async () => {
    const execute = vi.fn(async () => {
      throw new InvalidTransition(['collected']);
    }) as unknown as AcceptOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/accept`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'INVALID_TRANSITION',
      allowedTransitions: ['collected'],
    });
  });

  it('maps OrderNotFound to 404', async () => {
    const execute = vi.fn(async () => {
      throw new OrderNotFound();
    }) as unknown as AcceptOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/accept`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});
