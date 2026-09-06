# ADR-0004 — BullMQ on Redis; n8n dropped; Cairo-timezone schedules

**Status**: Accepted · **Date**: 2026-09-05

## Context

The PRD suggests "n8n / BullMQ" for the Habit Engine cron. The system needs scheduled jobs (digest, habit rules, ETA calibration, invariant checks), delayed jobs (the review request at T+30 minutes), and async processing (webhooks, outbound messages).

## Decision

**BullMQ on Redis for everything. n8n is not used.** All repeatable jobs declare `tz` of `Africa/Cairo`.

## Why n8n is dropped

A GUI-configured workflow tool puts part of the system behaviour outside version control. Four consequences a solo operator cannot absorb:

1. **No code review and no diff.** A change to a workflow that sends money-affecting messages leaves no reviewable artifact.
2. **No tests.** The habit targeting rules and the digest computation are exactly the logic that most needs property-based testing.
3. **No rollback.** Redeploying the previous image does not revert a workflow someone edited in a browser tab.
4. **No local reproduction.** NFR-56 requires the whole system to run on a laptop. A hosted workflow canvas breaks that, and it breaks the inheritance story in `12-team-and-operating-model.md`: a successor cannot inherit logic that lives in someone else's browser session.

n8n is a good tool for gluing together systems you do not own. It is the wrong place for domain logic that decides who gets messaged and what a business report says.

## The timezone decision

**Egypt observes DST, roughly April to October.** A UTC cron for the 22:00 digest delivers it at 21:00 for half the year. It is a small bug that reads to the owner as unreliability, and it is the kind nobody ever reports — "my report arrived an hour early" is not a complaint people make. So:

- every repeatable job carries an explicit `Africa/Cairo` timezone,
- timestamps are stored UTC and rendered per tenant,
- a test crosses a DST boundary and asserts the fire time.

Secondary observation for product: **22:00 may simply be the wrong hour** for a café that closes at 01:00, since the digest would omit a quarter of the day. Recommend making it configurable, defaulting to 30 minutes after close (GAP-10).

## Alternatives considered

**pg-boss** (jobs in Postgres, no Redis) — genuinely close, and tempting for removing a dependency. Rejected because BullMQ has better delayed-job ergonomics, which the T+30-minute review request needs, and because keeping queue churn off the transactional database preserves a clean separation as analytics load grows.

**Cloud scheduler plus serverless functions** — rejected. Splits scheduling from the code that implements it, introduces cold starts into a latency-sensitive system, and makes local reproduction harder.

## Consequences

**Good**: every scheduled behaviour is code — tested, reviewed, versioned, rollback-able, and runnable locally. One place to look when a schedule misfires.

**Bad**: Redis is one more thing to operate. Mitigated by using managed Redis with persistence, and by making every job idempotent and re-derivable from database state, so losing Redis delays work rather than losing it (NFR-24).
