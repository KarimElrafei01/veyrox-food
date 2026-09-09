import { z } from 'zod';

/**
 * RFC 9457 problem details. Clients switch on the stable `code`, never on `title`
 * or `detail` prose (CLAUDE.md — Conventions).
 */
export const problemDetails = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string(),
  traceId: z.string(),
});

export type ProblemDetails = z.infer<typeof problemDetails>;

/**
 * Every mutation carries an Idempotency-Key; replays return the original response,
 * not a 409 (CLAUDE.md — Non-negotiables). The header contract lives here so every
 * route that mutates references one definition.
 */
export const idempotencyKeyHeader = z.object({
  'idempotency-key': z.uuid(),
});
