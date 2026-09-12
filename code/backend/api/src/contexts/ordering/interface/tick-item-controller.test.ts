import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt, mintPinActionToken } from '../../identity/domain/index.js';
import type { TickItem } from '../application/tick-item.js';
import { OrderItemNotFound, OrderNotFound } from '../application/tick-item.js';
import { InvalidTransition } from '../infrastructure/kitchen-order-repository.js';

const DEVICE_KEY = 'device-key';
const PIN_KEY = 'pin-key';
const ORDER_ID = '01930b2e-0000-7000-8000-000000000001';
const ITEM_ID = '01930b2e-0000-7000-8000-000000000003';

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

function harness(execute?: TickItem['execute']) {
  const emit = vi.fn(async () => undefined);
  const tick = { execute: execute ?? vi.fn() } as unknown as TickItem;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    tickItem: { tick, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY], emit },
  }).then((app) => ({ app, tick, emit }));
}

describe('POST /orders/:id/items/:itemId/tick', () => {
  it('rejects a request with no staff auth', async () => {
    const { app } = await harness();
    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/items/${ITEM_ID}/tick`,
      payload: { ticked: true, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('ticks the item and echoes Idempotency-Replayed: false', async () => {
    const execute = vi.fn(async () => ({
      orderItemId: ITEM_ID,
      ticked: true,
      replayed: false,
    })) as unknown as TickItem['execute'];
    const { app, emit } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/items/${ITEM_ID}/tick`,
      headers: headers(),
      payload: { ticked: true, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('false');
    expect(response.json()).toMatchObject({ orderItemId: ITEM_ID, ticked: true });
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('maps OrderItemNotFound to 404', async () => {
    const execute = vi.fn(async () => {
      throw new OrderItemNotFound();
    }) as unknown as TickItem['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/items/${ITEM_ID}/tick`,
      headers: headers(),
      payload: { ticked: true, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('maps InvalidTransition to 409 - ticking a ready or terminal order is meaningless', async () => {
    const execute = vi.fn(async () => {
      throw new InvalidTransition([]);
    }) as unknown as TickItem['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/items/${ITEM_ID}/tick`,
      headers: headers(),
      payload: { ticked: true, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('maps OrderNotFound to 404', async () => {
    const execute = vi.fn(async () => {
      throw new OrderNotFound();
    }) as unknown as TickItem['execute'];
    const { app } = await harness(execute);

    const response = await app.inject({
      method: 'POST',
      url: `/orders/${ORDER_ID}/items/${ITEM_ID}/tick`,
      headers: headers(),
      payload: { ticked: true, idempotencyKey: '01930b2e-0000-7000-8000-000000000002' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});
