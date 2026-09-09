/**
 * Dev-only in-process stand-ins for Redis and the BullMQ queue, used when
 * `REDIS_URL=memory` (see `main.ts`). Lets `pnpm dev` serve every HTTP endpoint on
 * a machine with no Redis.
 *
 * Tradeoffs, all local-fidelity only — production never takes this path:
 *   - the cache is per-process and not shared between api and worker
 *   - TTLs are wall-clock timers, close enough for a cache
 *   - `enqueue` is a no-op, so the WhatsApp webhook does not reach a worker
 *
 * `main.ts` refuses `REDIS_URL=memory` when NODE_ENV=production.
 */

export interface DevCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  ping(): Promise<string>;
  connect(): Promise<unknown>;
  disconnect(): void;
  readonly status: string;
}

export interface DevQueue {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
  close(): Promise<void>;
}

export function createMemoryRedis(): DevCache {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  const live = (key: string): string | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };

  return {
    status: 'ready',
    async get(key) {
      return live(key);
    },
    async set(key, value, _mode, seconds) {
      store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async ping() {
      return 'PONG';
    },
    async connect() {
      return undefined;
    },
    disconnect() {
      store.clear();
    },
  };
}

export function createNoopQueue(): DevQueue {
  return {
    async add() {
      return undefined;
    },
    async close() {
      return undefined;
    },
  };
}
