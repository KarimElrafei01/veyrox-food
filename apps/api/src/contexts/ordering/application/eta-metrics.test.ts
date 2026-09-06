import { describe, expect, it, vi } from 'vitest';
import { recordEtaRead } from './eta-metrics.js';

describe('recordEtaRead', () => {
  it('records cache misses and degraded fallbacks separately', () => {
    const increment = vi.fn();
    const gauge = vi.fn();
    recordEtaRead({ increment, gauge }, 'degraded', 3);
    expect(increment).toHaveBeenCalledWith('eta_cache_miss_total');
    expect(increment).toHaveBeenCalledWith('eta_fallback_total');
    expect(gauge).toHaveBeenCalledWith('eta_queue_depth', 3);
  });
});
