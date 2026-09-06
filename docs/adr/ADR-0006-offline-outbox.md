# ADR-0006 — Offline-first Ops app via an IndexedDB outbox and idempotency keys

**Status**: Accepted · **Date**: 2026-09-05

## Context

The Till and KDS run on tablets on café wifi during the twenty minutes of the day that matter most. Café wifi in Cairo drops. A Till that stops taking orders when the connection does is worse than the notebook it replaced, and NR-7 identifies "the café goes back to paper" as the most likely way this product actually dies.

## Decision

`apps/kds` and `apps/till` are **offline-first**, via shared `packages/ops-core` (ADR-0009 amendment, 2026-09-06):

- Every staff action is written to an **IndexedDB outbox** with a client-generated **UUIDv7 idempotency key**, applied optimistically to local state, and flushed by a background sync loop with exponential backoff.
- The server dedupes on `(tenant_id, idempotency_key)` via a unique index; a replay returns the **original stored response** with `Idempotency-Replayed: true`, never a 409.
- The order state machine is **idempotent on re-entry**: advancing an already-`ready` ticket returns `ready` with 200.
- A service worker caches the app shell and the menu.

## The one thing that is deliberately not optimistic

**Payment state.** A Till order can be created and sent to the kitchen offline; it cannot be marked Paid until the server confirms, and the UI shows a distinct "pending sync" state. Day-end close-out is blocked while unsynced actions remain.

The asymmetry is intentional. An optimistically-created order that turns out to be a duplicate is a small operational annoyance the staff can see and fix. An optimistically-recorded *payment* that never reaches the server is money that silently disappears from the books — undetectable, unattributable, and exactly the class of error the ledger design exists to eliminate. Offline convenience does not extend to money.

## Alternatives considered

**Online-only, with a clear error state.** Simplest, and rejected outright: it fails at the exact moment the product must not fail.

**A local-first sync engine** (a CRDT library, ElectricSQL, or similar). Rejected. Genuinely powerful, but it implies clients writing to a replicated store, which breaks the single-write-path rule that makes the ledger invariant enforceable (ADR-0002). It also introduces conflict-resolution semantics for operations — void, payment — where "merge" has no correct meaning. An outbox of *intents* validated by one server is the right model for a domain with real invariants.

**Queue in `localStorage`.** Rejected. Synchronous, size-limited, and string-only. IndexedDB is the correct primitive for a durable queue.

## Consequences

**Good**: the Till keeps trading through outages; duplicate submissions are structurally impossible; the same idempotency mechanism protects against double-taps, retries, and replays with one implementation.

**Bad**: real complexity in state reconciliation, and it is where subtle data loss hides. Mitigated by the dedicated offline test suite (`07-test-and-quality-strategy.md` §7), whose most important case is a **partial flush interrupted by a second disconnection** — a clean offline-to-online transition is easy; the interrupted one is where duplicates are actually born, and it is exactly what café wifi does.

Staff also need to understand the offline indicator, which is a training item and a design constraint, not just a code one.
