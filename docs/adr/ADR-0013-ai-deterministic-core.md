# ADR-0013 — Deterministic statistics for every number; the LLM only phrases

**Status**: Accepted · **Date**: 2026-09-05

## Context

PRD §8.5.4 specifies four AI add-ons — Demand Forecasting & Waste, Off-Peak Pricing, Menu Engineering, and Ramadan-Ready Labor Scheduling — as the monetized layer and, per R3, the differentiator for the Has-POS track. They are sold to a small-business owner who will act on their output with real money.

## Decision

**Every number is computed deterministically in TypeScript or SQL. The LLM is used for one job only: turning a computed table into two sentences of Egyptian-Arabic prose.**

| Add-on | Actual technique |
|---|---|
| Demand Forecasting & Waste | Per-item day-of-week × hour-of-day profile with an EWMA level, plus an explicit Egyptian holiday and Ramadan calendar overlay. Reports a prediction interval. Perishables are ordered to the upper bound, staples to the point estimate |
| Menu Engineering | Deterministic quadrant classification on (margin %, unit volume) against the period median |
| Off-Peak Pricing | Rules with hard guardrails: discount only, capped depth, capped hours, never below `cost × 1.15` |
| Ramadan Labor Scheduling | Constraint satisfaction over the iftar demand curve with availability and rest constraints. Greedy plus local search |

Where an LLM is used (`claude-sonnet-5`, structured output, Zod-validated): the numbers are computed first and passed in, and the prompt instructs the model to **restate and never derive**. A response failing schema validation is discarded and the deterministic table is sent alone.

## Rationale

**An owner will make a purchasing decision from this output.** A hallucinated quantity is a real financial loss to a small business that cannot absorb it. The blast radius of a bad sentence is a bad sentence; the blast radius of a bad number is the owner's month, and — worse — the moment they discover one wrong number, every other number in the product becomes suspect. Trust in this product is a single shared resource across the dashboard, the digest, and the margin report.

**These are not LLM-shaped problems anyway.** Forecasting from six weeks of single-café data is a small-sample statistics problem where the honest answer includes an interval. Menu engineering is arithmetic on two axes. Off-peak pricing is a constrained rules problem. Using a model for any of them would be slower, more expensive, non-reproducible, and less accurate than the direct method.

**Explainability is a feature, not a compliance box.** An owner who is told "order 40 croissants tomorrow" will not act on it. An owner who is told "Tuesdays average 34, last three Tuesdays trended up, order 40 to cover the upper bound" will. Deterministic methods produce that explanation for free; an LLM produces a plausible-sounding one that may not describe what actually happened.

## Two structural guardrails

**Off-peak pricing cannot express a surcharge.** PRD §4 makes peak-hour price increases a permanent, not merely v1, constraint — motivated by the Wendy's precedent. So the discount field is unsigned and validated greater than zero, and there is no code path that produces a positive price delta. A future contributor cannot add surge pricing by changing a config value; they would have to change the schema, which is exactly the friction a permanent constraint deserves (FR-5.19).

**Every AI output is stored with the deterministic payload that produced it** (FR-5.21), so an owner complaint months later is reconstructible rather than a matter of guessing what the model said.

## Alternatives considered

**An LLM computing the forecast directly** from raw sales history in the prompt. Rejected — non-reproducible, unexplainable, and it fabricates confidently on sparse data, which is exactly the data situation here.

**A classical ML model (gradient boosting, Prophet, or similar).** Rejected for v1, not on principle. With one café and a few weeks of history there is not enough data for a learned model to beat a well-constructed seasonal profile, and a model brings training infrastructure, drift monitoring, and a feature store that a solo operator should not take on before the simpler method demonstrably runs out of accuracy. Revisit at Hire 3, with real multi-café data.

**No LLM at all.** Viable, and the fallback path is exactly this. Kept because a two-sentence Arabic summary genuinely improves the digest's readability for an owner glancing at their phone at 22:00 — and because it degrades gracefully to nothing.

## Consequences

**Good**: numbers are reproducible, explainable, testable, and cheap. AI cost is bounded and capped per tenant. The product degrades to a correct table rather than to nothing, or to something wrong.

**Bad**: less impressive in a demo than "the AI figures it out." That is a marketing problem and it is the right trade — a demo that impresses and then loses a café money in month two is worse than one that is merely convincing and correct.
