import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Every mutation carries an `Idempotency-Key`; replays return the original
 * response, not a 409 (CLAUDE.md — Non-negotiables).
 *
 * STUB. The real implementation (Sprint 2) records `(tenant_id, idempotency_key)`
 * with the response body and replays it on a repeat, backed by the unique index
 * on `orders` (docs/04 §6). For now this only enforces that mutating routes which
 * opt in are actually given a well-formed key, so no route ships without one.
 */
export function requireIdempotencyKey(request: FastifyRequest, reply: FastifyReply): void {
  const key = request.headers['idempotency-key'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof key !== 'string' || !uuid.test(key)) {
    void reply.status(400).type('application/problem+json').send({
      type: 'about:blank',
      title: 'Missing or malformed Idempotency-Key header',
      status: 400,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      traceId: request.id,
    });
  }
}
