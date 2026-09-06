import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';

const healthy = { pingPostgres: async () => true, pingRedis: async () => true };
const payload = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: 'phone-number' },
            messages: [{ id: 'wamid.1', from: '201000000000', text: { body: 'order' } }],
          },
        },
      ],
    },
  ],
});

describe('WhatsApp inbound webhook', () => {
  it('verifies the original bytes and only queues a provider event once', async () => {
    const inserted = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp({
      ...healthy,
      whatsappWebhook: {
        appSecret: 'secret',
        events: { insertIfAbsent: inserted },
        queue: { enqueue },
      },
    });
    const signature = `sha256=${createHmac('sha256', 'secret').update(payload).digest('hex')}`;

    const headers = { 'content-type': 'application/json', 'x-hub-signature-256': signature };
    expect(
      (await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload, headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload, headers }))
        .statusCode,
    ).toBe(200);
    expect(inserted).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({ providerMessageId: 'wamid.1' });
    await app.close();
  });

  it('rejects a signature made over different bytes before parsing', async () => {
    const app = await buildApp({
      ...healthy,
      whatsappWebhook: {
        appSecret: 'secret',
        events: { insertIfAbsent: vi.fn() },
        queue: { enqueue: vi.fn() },
      },
    });
    const signature = `sha256=${createHmac('sha256', 'secret').update(payload).digest('hex')}`;
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: payload.replace('"order"', '"different"'),
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    await app.close();
  });
});
