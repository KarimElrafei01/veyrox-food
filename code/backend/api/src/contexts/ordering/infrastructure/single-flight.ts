/**
 * Coalesces concurrent calls for the same key into one in-flight promise.
 * Without this, a cache-miss stampede (many requests racing a Redis TTL
 * expiry) opens one Postgres transaction per request instead of one total,
 * starving the shared pool that order placement also depends on.
 */
export function singleFlight<T>(): (key: string, fn: () => Promise<T>) => Promise<T> {
  const inFlight = new Map<string, Promise<T>>();
  return (key, fn) => {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  };
}
