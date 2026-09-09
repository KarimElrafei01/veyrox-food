import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { customerLocaleController } from './customer-locale-controller.js';
import { CustomerLocaleRepository } from '../infrastructure/customer-locale-repository.js';
import { mintCustomerSession } from './session-token.js';

const key = 'a test signing key with enough entropy';
const idempotencyKey = '11111111-1111-4111-8111-111111111111';
const token = mintCustomerSession(
  {
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerId: '22222222-2222-4222-8222-222222222222',
    waId: 'wa',
    menuVersionId: '33333333-3333-4333-8333-333333333333',
    tier: 'bronze',
    locale: 'en',
    issuedAt: 0,
    expiresAt: 4_102_444_800,
  },
  key,
);

describe('customer locale route', () => {
  it('requires a session and an idempotency key', async () => {
    const repository = Object.create(
      CustomerLocaleRepository.prototype,
    ) as CustomerLocaleRepository;
    const app = await buildApp({ pingPostgres: async () => true, pingRedis: async () => true });
    await app.register(customerLocaleController, { repository, keys: [key] });
    const response = await app.inject({
      method: 'POST',
      url: '/public/session/locale',
      headers: { authorization: `Bearer ${token}` },
      payload: { locale: 'ar-EG', sequence: 0 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns the durable replay marker', async () => {
    const repository = Object.create(
      CustomerLocaleRepository.prototype,
    ) as CustomerLocaleRepository;
    repository.update = async () => ({ locale: 'ar-EG', sequence: 2, replayed: true });
    const app = await buildApp({ pingPostgres: async () => true, pingRedis: async () => true });
    await app.register(customerLocaleController, { repository, keys: [key] });
    const response = await app.inject({
      method: 'POST',
      url: '/public/session/locale',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
      payload: { locale: 'ar-EG', sequence: 2 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['idempotency-replayed']).toBe('true');
    expect(response.json()).toMatchObject({ locale: 'ar-EG', sequence: 2 });
  });

  it('uses the sanitized internal-error problem for repository failures', async () => {
    const repository = Object.create(
      CustomerLocaleRepository.prototype,
    ) as CustomerLocaleRepository;
    repository.update = async () => {
      throw new Error('database unavailable');
    };
    const app = await buildApp({ pingPostgres: async () => true, pingRedis: async () => true });
    await app.register(customerLocaleController, { repository, keys: [key] });
    const response = await app.inject({
      method: 'POST',
      url: '/public/session/locale',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
      payload: { locale: 'ar-EG', sequence: 2 },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      code: 'INTERNAL',
      status: 500,
      traceId: expect.any(String),
    });
    await app.close();
  });
});
