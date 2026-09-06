import { describe, expect, it } from 'vitest';
import { toMinor } from './money/minor.js';
import { previewPoints } from './loyalty.js';

describe('previewPoints', () => {
  it('uses the tier multiplier after the ten-EGP base has been floored', () => {
    expect(previewPoints(toMinor(27_999), 'silver')).toEqual({ pointsToEarn: 32, multiplier: 1.2 });
    expect(previewPoints(toMinor(27_999), 'gold')).toEqual({ pointsToEarn: 40, multiplier: 1.5 });
  });
});
