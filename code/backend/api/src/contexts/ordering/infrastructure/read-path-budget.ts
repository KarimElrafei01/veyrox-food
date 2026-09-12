/**
 * Caps how many Postgres connections quote/ETA cache-miss rebuilds can hold
 * at once, out of the shared pool (`createPool`'s `max`). Order placement is
 * never routed through this limiter, so it is never capped by it — the point
 * is a guaranteed floor of free connections for placement, not a ceiling on
 * it. Shared as one instance across every read-path repository so the limit
 * is a joint budget, not one allowance per repository.
 */
export function createReadPathBudget(limit: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < limit) {
        active += 1;
        resolve();
        return;
      }
      queue.push(resolve);
    });

  const release = () => {
    const next = queue.shift();
    if (next) {
      next();
      return;
    }
    active -= 1;
  };

  return async (fn) => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}
