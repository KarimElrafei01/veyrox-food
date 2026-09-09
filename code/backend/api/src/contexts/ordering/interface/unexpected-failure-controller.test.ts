import { expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { publicCatalogueController } from '../../catalog/interface/public-catalogue-controller.js';
import type { CatalogueRepository } from '../../catalog/infrastructure/catalogue-repository.js';
import type { QuoteOrder } from '../application/quote-order.js';
import type { EtaMetricSink } from '../application/eta-metrics.js';
import type { EtaQueueRepository } from '../infrastructure/eta-queue-repository.js';
import { quoteOrderController } from './quote-order-controller.js';
import { mintCustomerSession } from '../../identity/domain/index.js';

const key = 'unexpected-failure-test-key';
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

function expectInternal(response: { statusCode: number; json(): unknown }): void {
  expect(response.statusCode).toBe(500);
  expect(response.json()).toMatchObject({
    code: 'INTERNAL',
    status: 500,
    traceId: expect.any(String),
  });
}

it('does not classify a quote dependency failure as an invalid session', async () => {
  const quote = {
    execute: async () => {
      throw new Error('postgres unavailable');
    },
  } as unknown as QuoteOrder;
  const app = await buildApp({ pingPostgres: async () => true, pingRedis: async () => true });
  await app.register(quoteOrderController, {
    quote,
    keys: [key],
    etaQueue: {} as EtaQueueRepository,
    etaMetrics: { increment: () => undefined, gauge: () => undefined } satisfies EtaMetricSink,
  });
  expectInternal(
    await app.inject({
      method: 'POST',
      url: '/public/orders/quote',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            clientLineId: '55555555-5555-4555-8555-555555555555',
            menuItemId: '44444444-4444-4444-8444-444444444444',
            qty: 1,
            modifierOptionIds: [],
          },
        ],
      },
    }),
  );
  await app.close();
});

it('does not classify an availability cache failure as an invalid session', async () => {
  const app = await buildApp({ pingPostgres: async () => true, pingRedis: async () => true });
  await app.register(publicCatalogueController, {
    catalogue: {} as CatalogueRepository,
    availabilityCache: {
      get: async () => {
        throw new Error('redis unavailable');
      },
      set: async () => undefined,
    },
    sessionKeys: [key],
  });
  expectInternal(
    await app.inject({
      method: 'GET',
      url: '/public/availability',
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  await app.close();
});
