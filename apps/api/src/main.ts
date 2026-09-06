import { Redis } from 'ioredis';
import { createDatabase, createPool } from '@veyroxai/db';
import { createLogger } from '@veyroxai/observability';
import { buildApp } from './app.js';
import { ResolveCustomerSession } from './contexts/ordering/application/resolve-customer-session.js';
import { CustomerSessionRepository } from './contexts/ordering/infrastructure/customer-session-repository.js';

const log = createLogger({ service: 'api' });

async function main(): Promise<void> {
  const pool = createPool();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const sessionKey = process.env.SESSION_KEY;
  if (!sessionKey) throw new Error('SESSION_KEY is not set');
  const previousSessionKey = process.env.SESSION_KEY_PREVIOUS;

  const app = await buildApp({
    pingPostgres: async () => {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    pingRedis: async () => {
      try {
        if (redis.status === 'wait') {
          await redis.connect();
        }
        return (await redis.ping()) === 'PONG';
      } catch {
        return false;
      }
    },
    customerSession: {
      resolver: new ResolveCustomerSession(new CustomerSessionRepository(createDatabase(pool))),
      keys: previousSessionKey ? [sessionKey, previousSessionKey] : [sessionKey],
    },
  });

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void (async () => {
        await app.close();
        await pool.end();
        redis.disconnect();
        process.exit(0);
      })();
    });
  }

  await app.listen({ port, host });
  log.info('api listening', { port, host });
}

main().catch((err: unknown) => {
  log.error('api failed to start', { err: String(err) });
  process.exit(1);
});
