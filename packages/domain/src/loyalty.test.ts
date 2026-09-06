import { describe, expect, it } from 'vitest';
import { toMinor } from './money/minor.js';
import { perksForTier, pointsToNextTier, previewPoints, tierForPoints } from './loyalty.js';

describe('previewPoints', () => {
  it('uses the tier multiplier after the ten-EGP base has been floored', () => {
    expect(previewPoints(toMinor(27_999), 'silver')).toEqual({ pointsToEarn: 32, multiplier: 1.2 });
    expect(previewPoints(toMinor(27_999), 'gold')).toEqual({ pointsToEarn: 40, multiplier: 1.5 });
  });

  it('holds every tier boundary and inherits Gold perks', () => {
    expect([150, 151, 500, 501].map(tierForPoints)).toEqual(['bronze', 'silver', 'silver', 'gold']);
    expect(pointsToNextTier(150)).toBe(1);
    expect(pointsToNextTier(501)).toBeNull();
    expect(perksForTier('gold')).toEqual(['free_alt_milk', 'priority_prep']);
  });

  it('covers Bronze, Silver, anonymous, and all points-to-next branches', () => {
    expect(perksForTier('bronze')).toEqual([]);
    expect(perksForTier('silver')).toEqual(['free_alt_milk']);
    expect(pointsToNextTier(151)).toBe(350);
    expect(previewPoints(toMinor(10_999), 'bronze')).toEqual({ pointsToEarn: 10, multiplier: 1 });
    expect(previewPoints(toMinor(10_999), null)).toEqual({ pointsToEarn: 0, multiplier: 0 });
  });
});
