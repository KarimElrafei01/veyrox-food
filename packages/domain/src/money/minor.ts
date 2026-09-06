/**
 * Money is integer minor units — piastres, where 1 EGP = 100 piastres (ADR-0007).
 *
 * The brand makes a plain `number` impossible to pass where an amount of money is
 * expected: unit-confusion bugs (piastres vs EGP, money vs material cost) become
 * compile errors rather than silent drift in a margin figure the owner prices against.
 *
 * Rounding happens exactly ONCE, at display, and never here. These helpers only ever
 * combine whole piastres, so no rounding is possible in the first place.
 */
export type Minor = number & { readonly __brand: 'Minor' };

export class NotAWholePiastre extends Error {
  constructor(value: number) {
    super(`Money must be a whole, finite number of piastres; got ${value}`);
    this.name = 'NotAWholePiastre';
  }
}

export class NonIntegerFactor extends Error {
  constructor(value: number) {
    super(`A money value may only be multiplied by a whole number; got ${value}`);
    this.name = 'NonIntegerFactor';
  }
}

/**
 * The single controlled entry point. Everything that produces a `Minor` — a database
 * read, a request boundary, a literal in a test — goes through here so a non-integer
 * or non-finite amount cannot enter the domain.
 */
// Collapse negative zero: a "-0 piastre" is nonsense and breaks Object.is
// equality in tests and caches. Every helper returns through here.
function brand(value: number): Minor {
  return (value === 0 ? 0 : value) as Minor;
}

export function toMinor(piastres: number): Minor {
  if (!Number.isInteger(piastres)) {
    throw new NotAWholePiastre(piastres);
  }
  return brand(piastres);
}

export const ZERO_MINOR: Minor = 0 as Minor;

export function addMinor(a: Minor, b: Minor): Minor {
  return brand(a + b);
}

export function subMinor(a: Minor, b: Minor): Minor {
  return brand(a - b);
}

/** Multiply an amount by a line quantity (a whole number of items). */
export function mulMinor(amount: Minor, factor: number): Minor {
  if (!Number.isInteger(factor)) {
    throw new NonIntegerFactor(factor);
  }
  return brand(amount * factor);
}

export function sumMinor(amounts: readonly Minor[]): Minor {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
  }
  return brand(total);
}
