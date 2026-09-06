# F1 backend implementation checklist

This checklist tracks the backend work required by F1.1 through F1.7. A box is
checked only after the implementation and its required automated coverage pass.

> **Coverage debt (2026-09-07).** F1.1–F1.7 implementation is done and covered by
> unit/API tests. Migrations 0006–0008 apply cleanly to a real Postgres 16 and
> `packages/db` `test:int` is green. Still owed: per-feature real-Postgres suites
> (F1.1–F1.7), an `apps/api` `test:int` harness, and honestly-remarked F1.4/F1.5
> integration items. See "Coverage backfill" — not release-ready until it is clear.

## F1.1 — Session and entry

- [x] Complete `GET /public/session/:token` response and stable problem details.
- [x] Enforce store hours, closures, resolved feature state, and no-show suspension.
- [x] Implement raw-byte verified, deduplicated WhatsApp inbound webhook and worker hand-off.
- [x] Resolve or create customer by keyed phone hash; mint and send CTA session.
- [ ] Add unit, integration, and webhook replay coverage. _(unit only; integration + replay owed — see Coverage backfill)_

## F1.2 — Menu and catalogue

- [x] Implement atomic immutable menu publication snapshots.
- [x] Implement public immutable menu endpoint with ETag and cache headers.
- [x] Implement authenticated live availability endpoint and invalidation.
- [ ] Add publication, retention, availability, byte-identity, and payload-budget coverage. _(unit only; suites owed — see Coverage backfill)_

## F1.3 — Cart and pricing

- [x] Implement quote repository, use case, and controller using the pinned publication.
- [x] Integrate availability, loyalty tier, and ETA into quote responses.
- [ ] Add property and API integration coverage for quote/placement parity. _(placeholder unit test only; real parity test blocked on F1.6 — see Coverage backfill)_

## F1.4 — ETA

- [x] Implement queue projection, Redis read path, and Postgres fallback.
- [x] Add ETA metrics and degraded-range behaviour.
- [ ] Add queue projection and fallback integration coverage. _(unit only — `eta-queue-repository.test.ts` builds the repo with a `null` DB, so the Postgres `rebuild()` fallback is never run against a database. Harness now unblocked — see Coverage backfill.)_

## F1.5 — Loyalty

- [x] Define tier thresholds, inherited perks, multipliers, and floor-after-multiply points policy.
- [x] Return tier, balance, points-to-next-tier, and perks from session resolution.
- [x] Return quote points preview without writing a loyalty fact.
- [x] Add the tenant-scoped append-only `loyalty_ledger` and its history index.
- [x] Accrue on staff-attributed collection only, transactionally updating `customers.points_cache` and tier.
- [x] Enqueue one idempotent tier celebration per customer, tier, and Cairo date.
- [ ] Prove INV-4 (`points_cache == SUM(loyalty_ledger.delta)`) and every tier boundary with unit/property and integration coverage. _(tier boundaries + the pure `loyaltyCacheMatchesLedger` check are covered; no test accrues through the real transaction and asserts INV-4 in Postgres, and `append-only.test.ts` does not cover `loyalty_ledger`. Harness now unblocked — see Coverage backfill.)_

## F1.6 — Order placement

- [x] Reconcile placement idempotency with the shared mutation-header contract.
- [x] Persist bounded ticket notes and add the tenant/customer open-order partial index.
- [x] Re-price from the pinned publication and persist immutable line, modifier, recipe, price-version, cost, and name snapshots.
- [x] Enforce feature, store, no-show, open-order, availability, stale-price, and minimum-value gates.
- [x] Make `(tenant_id, idempotency_key)` replay return the original placement response.
- [x] Append the customer `placed` event atomically with the order and ticket lines.
- [x] Publish `OrderPlaced` only after commit; do not take payment, deduct material, or accrue loyalty.
- [x] Add API/unit coverage for rejection, replay, snapshots, and no-ledger placement behaviour. _(use-case + controller unit/API coverage; real-Postgres concurrency/replay/no-ledger suite owed — see Coverage backfill)_
- [x] Run database schema/type/unit/API checks and commit the completed subfeature. _(migrations 0007/0008 applied to a real Postgres 16; type/unit/API/lint green. This also required fixing a pre-existing 0030 RLS policy collision and the deny-by-default predicate — see the `fix(db)` commit.)_

## F1.7 — Order status

- [x] Implement customer-owned status repository, use case, and controller.
- [x] Add localized customer status mapping and fixed ETA-promise handling.
- [ ] Add ownership and status-transition integration coverage. _(ownership + label + countdown covered by unit/API tests; real-Postgres status-transition suite owed — see Coverage backfill)_

## Coverage backfill (blocks release)

- [ ] Stand up the `apps/api` `test:int` harness against real Postgres (docker compose or a Neon branch).
- [x] Complete `packages/db/src/__integration__/graph.ts` — now seeds all 31 tables; `pnpm --filter @veyroxai/db test:int` is green (cross-tenant leak + append-only) against real Postgres 16.
- [ ] F1.1 — WhatsApp webhook replay/dedup integration test and session-resolution integration test.
- [ ] F1.2 — publication atomicity, retention, availability invalidation, byte-identity, and payload-budget suites.
- [ ] F1.3 — property test for quote pricing and an API integration test proving quote/placement parity (with F1.6).
- [ ] F1.4 — integration test for the ETA queue Postgres `rebuild()` fallback (currently only the Redis path and the pure reducer are covered).
- [ ] F1.5 — integration test that accrues through the real transaction and asserts INV-4 (`points_cache == SUM(loyalty_ledger.delta)`) in Postgres; add `loyalty_ledger` to `append-only.test.ts`.
- [ ] F1.6 — real-Postgres coverage: all gates independently, concurrent identical requests produce exactly one order, byte-identical replay, **no `material_ledger` rows after placement**, recipe edited between placement and Accept deducts the placement-stamped version.
- [ ] F1.7 — real-Postgres coverage: each status label in both locales, ownership returns `404` for another customer, `promised_eta_upper_at` written once at Accept and unchanged by later transitions.

## Release verification

- [ ] Regenerate OpenAPI without a diff.
- [ ] Run typecheck, lint, unit/property, real-Postgres integration, contracts, build, and relevant E2E tests.
- [ ] Verify WhatsApp in-app browser on iOS and Android.
