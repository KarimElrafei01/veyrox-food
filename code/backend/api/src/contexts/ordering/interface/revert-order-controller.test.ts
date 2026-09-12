import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt, mintPinActionToken } from '../../identity/domain/index.js';
import type { RevertOrder } from '../application/revert-order.js';
import { OrderNotFound } from '../application/revert-order.js';
import {
  InvalidTransition,
  RevertWindowExpired,
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

function harness(execute?: RevertOrder['execute']) {
  const revert = { execute: execute ?? vi.fn() } as unknown as RevertOrder;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    revertOrder: { revert, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY] },
  }).then((app) => ({ app, revert }));
}

describe('POST /orders/:id/revert', () => {
  it('rejects a request with no staff auth', async () => {
    const { app } = await harness();
    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/revert`,
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('reverts within the window and echoes Idempotency-Replayed: false', async () => {
    const execute = vi.fn(async () => ({
      ticket: { orderId: ORDER_ID, status: 'received' },
      replayed: false,
    })) as unknown as RevertOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/revert`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('false');
    expect(response.json()).toMatchObject({ orderId: ORDER_ID, status: 'received' });
  });

  it('maps RevertWindowExpired to 409 - past 60s, void is the only way back', async () => {
    const execute = vi.fn(async () => {
      throw new RevertWindowExpired();
    }) as unknown as RevertOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/revert`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'REVERT_WINDOW_EXPIRED' });
  });

  it('maps InvalidTransition to 409 - voided/abandoned/collected are never revert-eligible', async () => {
    const execute = vi.fn(async () => {
      throw new InvalidTransition([]);
    }) as unknown as RevertOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/revert`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('maps OrderNotFound to 404', async () => {
    const execute = vi.fn(async () => {
      throw new OrderNotFound();
    }) as unknown as RevertOrder['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/revert`,
      headers: headers(),
      payload: { idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});
