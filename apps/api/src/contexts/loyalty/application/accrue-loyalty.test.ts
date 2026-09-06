import { describe, expect, it } from 'vitest';
import { loyaltyCacheMatchesLedger, tierCelebrationKey } from './accrue-loyalty.js';

describe('loyalty accrual invariants', () => {
  it('uses a per-customer, tier, Cairo-date idempotency key', () => {
    expect(tierCelebrationKey('customer', 'silver', '2026-09-06')).toBe(
      'tier_celebration:customer:silver:2026-09-06',
    );
  });

  it('proves the display cache is the sum of append-only deltas', () => {
    expect(loyaltyCacheMatchesLedger(120, [100, 30, -10])).toBe(true);
    expect(loyaltyCacheMatchesLedger(121, [100, 30, -10])).toBe(false);
  });
});
