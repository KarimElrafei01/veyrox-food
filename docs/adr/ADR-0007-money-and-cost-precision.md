# ADR-0007 — Money as integer minor units; material costs as NUMERIC(14,6)

**Status**: Accepted · **Date**: 2026-09-05

## Context

The product charges customers, computes per-item margins that an owner will price against, and tracks material consumption where a single unit is a gram of milk. Two different precision problems, often conflated.

## Decision

**Two distinct representations:**

| Kind | Type | Unit | Where |
|---|---|---|---|
| **Money** — prices, deltas, totals, payments | `BIGINT` | piastres (1 EGP = 100) | Every field suffixed `_minor`. Every API contract |
| **Material cost** | `NUMERIC(14,6)` | EGP per material unit | `material_costs.cost_per_unit` |
| **Material quantity** | `NUMERIC(14,6)` | material unit (g, ml, piece) | `recipe_lines.qty`, `material_ledger.qty_delta` |

**Floating point is banned in both.** Money uses a branded TypeScript type:

```ts
type Minor = number & { readonly __brand: 'Minor' };
// A raw number cannot be passed where Minor is expected.
// A lint rule bans arithmetic between Minor and unbranded numbers.
```

**Rounding happens exactly once, at display**, using half-up on the final figure. Never at storage, never mid-calculation.

## Why two representations rather than one

This is the part that is usually got wrong. Integer minor units are correct for money because every real amount is a whole number of piastres and exactness is legally and practically required. But **material costs are not money amounts — they are rates**, and 1 gram of milk costs roughly 0.0022 EGP. Storing that in piastres rounds it to 0, and every margin computed from it is wrong. Storing it as a float accumulates error across the thousands of ledger rows a busy month produces.

`NUMERIC(14,6)` gives exact decimal arithmetic in the database at a precision that is comfortably beyond what any supplier price list expresses, and Postgres does the arithmetic exactly. The conversion to money happens once, when a per-item cost is finally rendered in piastres.

Getting this wrong is not a visible bug. It is a slow, silent drift in the margin figures that PRD §8.5.3 exists to make trustworthy — and the owner would never know, which is worse than a crash.

## Alternatives considered

**Floats everywhere.** Rejected — the standard reason, plus this system aggregates over months.

**`NUMERIC` for money too.** Rejected. Correct arithmetically, but it forces every boundary (JSON, TypeScript, the SPAs) to carry a decimal library, and JSON has no decimal type, so it would serialize as a string and be parsed back — a lot of ceremony for a value that is always a whole number of piastres.

**A decimal library (decimal.js, dinero.js) in TypeScript.** Rejected for money — integers are simpler and sufficient. Not needed for costs either, because cost arithmetic happens in Postgres, where `NUMERIC` is native and exact.

## Consequences

**Good**: money arithmetic is exact and cheap; the branded type makes a whole class of unit-confusion bugs a compile error; margins stay accurate over long aggregation windows.

**Bad**: two representations means one conversion boundary, which is a place bugs can live. Contained by putting the conversion in exactly one function in `packages/domain`, tested at every rounding boundary, and by PROP-6, which asserts that no piastre is created or destroyed by rounding in any cart.
