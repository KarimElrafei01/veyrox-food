import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintCustomerSession } from './session-token.js';
import type { OrderStatusRepository } from '../infrastructure/order-status-repository.js';

const KEY = 'status-key';
const ORDER_ID = '0192d425-9790-7dd9-8aa9-8cbd4c3844db';

function token(customerId = 'c1') {
  return mintCustomerSession(
    {
      tenantId: 't1',
      customerId,
      waId: '2010',
      menuVersionId: 'm1',
      tier: 'bronze',
      locale: 'en',
      issuedAt: 0,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
    KEY,
  );
}

function harness(findOwnedOrder: OrderStatusRepository['findOwnedOrder']) {
  const orders = { findOwnedOrder: vi.fn(findOwnedOrder) } as unknown as OrderStatusRepository;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    orderStatus: { orders, keys: [KEY] },
  }).then((app) => ({ app, orders }));
}

describe('GET /public/orders/:orderId/status', () => {
  it('returns the localized status for an order the token owns', async () => {
    const { app } = await harness(async () => ({
      orderId: ORDER_ID,
      orderNumber: 'A-047',
      status: 'placed',
      totalMinor: 27500,
      promisedEtaLowerAt: null,
      promisedEtaUpperAt: null,
      placedAt: new Date('2026-09-07T12:00:00Z'),
      acceptedAt: null,
      readyAt: null,
      collectedAt: null,
      rejectionReason: null,
      rejectedAt: null,
    }));
    const res = await app.inject({
      method: 'GET',
      url: `/public/orders/${ORDER_ID}/status`,
      headers: { authorization: `Bearer ${token()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().statusLabel).toEqual({
      en: 'Sent to the kitchen',
      'ar-EG': 'تم الإرسال للمطبخ',
    });
    await app.close();
  });

  it('answers 404 — not 403 — when the order belongs to another customer', async () => {
    const { app, orders } = await harness(async () => null);
    const res = await app.inject({
      method: 'GET',
      url: `/public/orders/${ORDER_ID}/status`,
      headers: { authorization: `Bearer ${token('someone-else')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('ORDER_NOT_FOUND');
    expect(orders.findOwnedOrder).toHaveBeenCalledWith('t1', 'someone-else', ORDER_ID);
    await app.close();
  });

  it('requires a session token', async () => {
    const { app } = await harness(async () => null);
    const res = await app.inject({ method: 'GET', url: `/public/orders/${ORDER_ID}/status` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
