export interface EtaMetricSink {
  increment(name: 'eta_cache_miss_total' | 'eta_fallback_total'): void;
  gauge(name: 'eta_queue_depth', value: number): void;
}

/** Keeps the ETA signals explicit until the OTel transport is installed. */
export function recordEtaRead(
  metrics: EtaMetricSink,
  source: 'redis' | 'postgres' | 'degraded',
  queueDepth: number,
): void {
  if (source !== 'redis') metrics.increment('eta_cache_miss_total');
  if (source === 'degraded') metrics.increment('eta_fallback_total');
  metrics.gauge('eta_queue_depth', queueDepth);
}
