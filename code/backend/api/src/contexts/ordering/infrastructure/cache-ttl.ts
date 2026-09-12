/**
 * A flat TTL means every tenant's cache entry written around the same time
 * expires at the same time. Under broad load (many tenants, or a cold cache
 * after a Redis restart) that produces a synchronized stampede across
 * distinct cache keys — which single-flight cannot coalesce, since each key
 * is a genuinely separate rebuild. Jitter spreads expiries so that stampede
 * doesn't cluster into one instant.
 */
export function jitteredTtlSeconds(baseSeconds: number, spreadSeconds: number): number {
  return baseSeconds + Math.floor(Math.random() * spreadSeconds);
}
