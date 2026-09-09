import { describe, expect, it } from 'vitest';
import {
  addMinor,
  mulMinor,
  NonIntegerFactor,
  NotAWholePiastre,
  subMinor,
  sumMinor,
  toMinor,
  ZERO_MINOR,
} from './minor.js';

describe('toMinor', () => {
  it('accepts a whole number of piastres', () => {
    expect(toMinor(0)).toBe(0);
    expect(toMinor(2500)).toBe(2500);
    expect(toMinor(-125)).toBe(-125);
  });

  it('rejects a fractional amount', () => {
    expect(() => toMinor(12.5)).toThrow(NotAWholePiastre);
  });

  it('rejects a non-finite amount', () => {
    expect(() => toMinor(Number.POSITIVE_INFINITY)).toThrow(NotAWholePiastre);
    expect(() => toMinor(Number.NaN)).toThrow(NotAWholePiastre);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(addMinor(toMinor(1000), toMinor(250))).toBe(1250);
    expect(subMinor(toMinor(1000), toMinor(250))).toBe(750);
  });

  it('allows a negative result (deltas and refunds)', () => {
    expect(subMinor(toMinor(100), toMinor(400))).toBe(-300);
  });

  it('multiplies by a whole line quantity', () => {
    expect(mulMinor(toMinor(1250), 3)).toBe(3750);
  });

  it('rejects a fractional factor', () => {
    expect(() => mulMinor(toMinor(1250), 1.5)).toThrow(NonIntegerFactor);
  });

  it('sums an empty list to zero', () => {
    expect(sumMinor([])).toBe(ZERO_MINOR);
  });

  it('sums a list', () => {
    expect(sumMinor([toMinor(100), toMinor(200), toMinor(50)])).toBe(350);
  });
});
