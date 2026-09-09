import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

/**
 * Liveness and readiness. `/health` checks the dependencies the API cannot serve
 * a request without (Postgres, Redis); the deploy's rollback gate reads it.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health/live',
    { schema: { response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => ({ status: 'ok' as const }),
  );

  app.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            checks: z.object({ postgres: z.boolean(), redis: z.boolean() }),
          }),
          503: z.object({
            status: z.literal('degraded'),
            checks: z.object({ postgres: z.boolean(), redis: z.boolean() }),
          }),
        },
      },
    },
    async (_request, reply) => {
      const checks = {
        postgres: await app.deps.pingPostgres(),
        redis: await app.deps.pingRedis(),
      };
      const healthy = checks.postgres && checks.redis;
      return reply.status(healthy ? 200 : 503).send({
        status: healthy ? ('ok' as const) : ('degraded' as const),
        checks,
      });
    },
  );
}
