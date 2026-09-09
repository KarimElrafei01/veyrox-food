import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@veyroxai/observability';

const log = createLogger({ service: 'worker' });

export const QUEUE_NAME = 'veyrox';

/**
 * Same image as `apps/api`, different entrypoint (ADR-0011). BullMQ on Redis, not
 * n8n (ADR-0004). No jobs are registered yet — the digest, review-request,
 * abandon, and invariant-check jobs land in their respective sprints.
 */
async function main(): Promise<void> {
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue(QUEUE_NAME, { connection });
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      log.info('job processed', { name: job.name, id: job.id });
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    log.error('job failed', { name: job?.name, id: job?.id, err: err.message });
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void (async () => {
        await worker.close();
        await queue.close();
        connection.disconnect();
        process.exit(0);
      })();
    });
  }

  log.info('worker started', { queue: QUEUE_NAME });
}

main().catch((err: unknown) => {
  log.error('worker failed to start', { err: String(err) });
  process.exit(1);
});
