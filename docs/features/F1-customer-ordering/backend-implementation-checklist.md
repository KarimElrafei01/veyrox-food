# F1 backend implementation checklist

This checklist tracks the backend work required by F1.1 through F1.7. A box is
checked only after the implementation and its required automated coverage pass.

## F1.1 — Session and entry

- [ ] Complete `GET /public/session/:token` response and stable problem details.
- [ ] Enforce store hours, closures, resolved feature state, and no-show suspension.
- [ ] Implement raw-byte verified, deduplicated WhatsApp inbound webhook and worker hand-off.
- [ ] Resolve or create customer by keyed phone hash; mint and send CTA session.
- [ ] Add unit, integration, and webhook replay coverage.

## F1.2 — Menu and catalogue

- [ ] Implement atomic immutable menu publication snapshots.
- [ ] Implement public immutable menu endpoint with ETag and cache headers.
- [ ] Implement authenticated live availability endpoint and invalidation.
- [ ] Add publication, retention, availability, byte-identity, and payload-budget coverage.

## F1.3 — Cart and pricing

- [ ] Implement quote repository, use case, and controller using the pinned publication.
- [ ] Integrate availability, loyalty tier, and ETA into quote responses.
- [ ] Add property and API integration coverage for quote/placement parity.

## F1.4 — ETA

- [ ] Implement queue projection, Redis read path, and Postgres fallback.
- [ ] Add ETA metrics and degraded-range behaviour.
- [ ] Add queue projection and fallback integration coverage.

## F1.5 — Loyalty

- [ ] Implement loyalty tier policy, points preview, and session output.
- [ ] Implement collection-side append-only accrual, cached balance, and tier celebrations.
- [ ] Add ledger invariant and tier-boundary coverage.

## F1.6 — Order placement

- [ ] Implement server-authoritative transactional placement and immutable snapshots.
- [ ] Enforce idempotency, availability, minimum value, store, feature, open-order, and no-show gates.
- [ ] Emit committed `OrderPlaced` effects without material deduction or payment.
- [ ] Add real-Postgres concurrency, replay, snapshot, and no-ledger-row coverage.

## F1.7 — Order status

- [ ] Implement customer-owned status repository, use case, and controller.
- [ ] Add localized customer status mapping and fixed ETA-promise handling.
- [ ] Add ownership and status-transition integration coverage.

## Release verification

- [ ] Regenerate OpenAPI without a diff.
- [ ] Run typecheck, lint, unit/property, real-Postgres integration, contracts, build, and relevant E2E tests.
- [ ] Verify WhatsApp in-app browser on iOS and Android.
