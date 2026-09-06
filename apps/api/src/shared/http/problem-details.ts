import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ProblemDetails } from '@veyroxai/contracts';

/**
 * Every error leaves the API as an RFC 9457 problem document with a stable `code`
 * and a `traceId` (CLAUDE.md — Conventions). Clients switch on `code`, never prose.
 */
export function problemHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const traceId = request.id;

  if (hasZodFastifySchemaValidationErrors(error)) {
    send(reply, {
      type: 'about:blank',
      title: 'Request validation failed',
      status: 400,
      detail: error.validation.map((v) => v.message).join('; '),
      code: 'VALIDATION_FAILED',
      traceId,
    });
    return;
  }

  const status = error.statusCode ?? 500;
  request.log.error({ err: error }, 'request failed');
  send(reply, {
    type: 'about:blank',
    title: status >= 500 ? 'Internal server error' : error.message,
    status,
    code: error.code ?? (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST'),
    traceId,
  });
}

function send(reply: FastifyReply, problem: ProblemDetails): void {
  void reply.status(problem.status).type('application/problem+json').send(problem);
}
