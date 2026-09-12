import { describe, expect, it } from 'vitest';
import { jitteredTtlSeconds } from './cache-ttl.js';

describe('jitteredTtlSeconds', () => {
  it('stays within [base, base + spread)', () => {
    for (let i = 0; i < 200; i += 1) {
      const ttl = jitteredTtlSeconds(300, 60);
      expect(ttl).toBeGreaterThanOrEqual(300);
      expect(ttl).toBeLessThan(360);
    }
  });

  it('returns exactly base when spread is zero', () => {
    expect(jitteredTtlSeconds(300, 0)).toBe(300);
  });
});
