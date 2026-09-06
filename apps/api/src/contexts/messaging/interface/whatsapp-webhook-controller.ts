import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyMetaSignature } from './verify-meta-signature.js';

const metaEnvelope = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string().min(1) }),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string().min(1),
                  profile: z.object({ name: z.string() }).optional(),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  id: z.string().min(1),
                  from: z.string().min(1),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export interface InboundEventStore {
  insertIfAbsent(input: { providerMessageId: string; payload: unknown }): Promise<boolean>;
}

export interface InboundJobQueue {
  enqueue(input: { providerMessageId: string }): Promise<void>;
}

/** Verifies bytes before parsing because parse/serialise is not the signed message. */
export async function whatsappWebhookController(
  app: FastifyInstance,
  options: { appSecret: string; events: InboundEventStore; queue: InboundJobQueue },
): Promise<void> {
  app.post('/webhooks/whatsapp', async (request, reply) => {
    const rawBody = request.body;
    if (!Buffer.isBuffer(rawBody)) return reply.status(415).send();
    const signature = request.headers['x-hub-signature-256'];
    if (
      !verifyMetaSignature(
        rawBody,
        typeof signature === 'string' ? signature : undefined,
        options.appSecret,
      )
    ) {
      return reply.status(401).type('application/problem+json').send({
        type: 'https://veyroxai.com/errors/webhook-signature-invalid',
        title: 'Webhook signature invalid',
        status: 401,
        code: 'WEBHOOK_SIGNATURE_INVALID',
        traceId: request.id,
      });
    }

    let parsed: z.infer<typeof metaEnvelope>;
    try {
      parsed = metaEnvelope.parse(JSON.parse(rawBody.toString('utf8')));
    } catch {
      request.log.warn('discarded malformed verified WhatsApp webhook');
      return reply.status(200).send();
    }
    const messageIds = parsed.entry.flatMap((entry) =>
      entry.changes.flatMap((change) => change.value.messages?.map((message) => message.id) ?? []),
    );
    for (const providerMessageId of messageIds) {
      if (await options.events.insertIfAbsent({ providerMessageId, payload: parsed })) {
        await options.queue.enqueue({ providerMessageId });
      }
    }
    return reply.status(200).send();
  });
}
