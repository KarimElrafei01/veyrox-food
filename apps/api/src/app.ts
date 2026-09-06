import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { problemHandler } from './shared/http/problem-details.js';
import { healthRoutes } from './routes/health.js';
import { customerSessionController } from './contexts/ordering/interface/customer-session-controller.js';
import type { ResolveCustomerSession } from './contexts/ordering/application/resolve-customer-session.js';

export interface AppDeps {
  pingPostgres: () => Promise<boolean>;
  pingRedis: () => Promise<boolean>;
  customerSession?: { resolver: ResolveCustomerSession; keys: readonly [string, ...string[]] };
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

/**
 * The single write path (T1). One Fastify app, schema-first with Zod so validation,
 * types, and the OpenAPI document come from one declaration (ADR-0001).
 * Dependencies are injected so tests run the real routes without a database.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(problemHandler);
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).type('application/problem+json').send({
      type: 'about:blank',
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
      traceId: request.id,
    });
  });
  app.decorate('deps', deps);

  await app.register(helmet);
  await app.register(healthRoutes);
  if (deps.customerSession) await app.register(customerSessionController, deps.customerSession);

  return app;
}
