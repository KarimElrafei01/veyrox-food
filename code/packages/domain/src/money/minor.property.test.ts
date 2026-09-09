import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { addMinor, mulMinor, sumMinor, toMinor, ZERO_MINOR } from './minor.js';

// Amounts up to ~10,000,000 piastres (100k EGP) — comfortably above any real cart,
// well inside safe-integer range for the sums a busy month produces.
const amount = fc.integer({ min: -10_000_000, max: 10_000_000 }).map(toMinor);

// Seed for PROP-2 (docs/07 §3): adding items to a cart in any order yields the same total.
test.prop([fc.array(amount)])('sumMinor is order-independent', (amounts) => {
  const shuffled = [...amounts].reverse();
  expect(sumMinor(shuffled)).toBe(sumMinor(amounts));
});

// Seed for PROP-6: no piastre is created or destroyed by combining amounts.
test.prop([fc.array(amount)])('sumMinor equals a left fold of addMinor', (amounts) => {
  const folded = amounts.reduce((acc, a) => addMinor(acc, a), ZERO_MINOR);
  expect(sumMinor(amounts)).toBe(folded);
});

test.prop([amount, fc.nat({ max: 1000 })])('mulMinor equals repeated addition', (unit, qty) => {
  let byAddition = ZERO_MINOR;
  for (let i = 0; i < qty; i += 1) {
    byAddition = addMinor(byAddition, unit);
  }
  expect(mulMinor(unit, qty)).toBe(byAddition);
});
