# Veyrox Food — Test & Quality Strategy

A solo team cannot afford a slow test suite, and cannot afford a production correctness bug in money. Those two constraints determine everything below.

**Governing principle:** put the testing weight where a bug is *expensive and silent*. A visual glitch on the console is cheap and loud. A 0.3g milk discrepancy on a voided order is cheap-looking, invisible, and compounds until the owner stops believing the dashboard. The pyramid is weighted accordingly.

---

## 1. The shape

```
                    ┌──────────────────────┐
                    │  Café day simulation │   1 event, pre-pilot, real hardware
                    ├──────────────────────┤
                    │      Game days       │   5 scenarios, pre-GA
                    ├──────────────────────┤
                    │    E2E (Playwright)  │   7 journeys, on merge to main
                    ├──────────────────────┤
                    │  Contract / webhook  │   replayed real payloads
                    ├──────────────────────┤
                    │  Integration (real   │   state machine, RLS, idempotency,
                    │  Postgres)           │   transactional void
                    ├──────────────────────┤
                    │  Property-based      │  ◄── the highest-value tests here
                    ├──────────────────────┤
                    │  Unit (@veyroxai/      │   90% line / 100% branch gate
                    │  domain, pure)       │
                    └──────────────────────┘
```

Whole suite budget: **under 5 minutes on CI** (NFR-59). A suite that takes twenty minutes gets skipped under pressure, and a solo dev has nobody to catch what they skipped.

---

## 2. Unit tests — `packages/domain`

`packages/domain` is pure: no I/O, no ambient clock, no randomness (both injected). Everything that decides a price, cost, quantity, tier, or state transition lives here. Coverage gate: **90% line, 100% branch**, enforced in CI as a failing check.

What is tested exhaustively:

| Module | Cases that must be covered |
|---|---|
| `priceCart` | Modifier deltas; tier waivers (Silver/Gold alt-milk free); required-group violations; quantity multiplication; rounding at every boundary; discount application order |
| `recipeCost` | Modifier-specific recipe lines; unit conversions; sub-piastre precision; a missing cost; a **placeholder** cost |
| `eta` | Single item; large cart; empty queue; deep queue; zero active stations (must not divide by zero); the range rounding |
| `loyalty` | Accrual at each multiplier; every tier boundary (150/151, 500/501); crossing up; clawback taking a customer back down; the "celebrate once per crossing" rule |
| `orderStateMachine` | Every legal transition; every illegal one; **re-entry into the current state returning a no-op**; Till `draft → pending → received` with deduction only on Accept; void reachable only after `received` |
| `ledger` | Deduction row generation; exact negation; sign conventions; the reversal-uniqueness rule |
| `paymentRollup` | Cash/visa splits; exclusion of voided and refunded orders; the shared query used by both EOD and digest |
| `resolveFeature` | **Every combination of the three layers.** Layer 1 disabled always wins; Layer 2 `none` and `suspended` return distinct reasons; `preview` returns preview mode; missing cache falls back to the conservative default. This is a small function guarding entitlement revenue and a legal kill switch, so it gets exhaustive coverage rather than sampled coverage |

**Boundary discipline:** every threshold in the PRD (tier boundaries at 150/151 and 500/501, margin colour bands at exactly 50% and 70%, the 2–3 day win-back window inclusive on both ends, the 24-hour WhatsApp window) has a test at the boundary and one either side. Off-by-one errors in thresholds are the most common way a correct-looking system quietly does the wrong thing to a specific customer.

---

## 3. Property-based tests — the most valuable asset here

Using `fast-check`. These are what turn PRD §8.4's acceptance criterion from a claim into a proof.

### PROP-1 — The ledger invariant *(the important one)*

```
For any randomly generated sequence of:
  - order creations with random carts,
  - recipe edits interleaved at random points,
  - material cost edits interleaved at random points,
  - sends-to-kitchen, payments, and voids in random order,
then for every order that ends in `voided`, and for every material:
  sum(qty_delta) == 0        exactly, not within epsilon.
```

The recipe edits are the point. A test that only voids orders under a stable recipe passes against the *naive, wrong* implementation, which is exactly the bug this design exists to prevent (`04-data-model.md` §1).

### PROP-2 — Pricing is order-independent and associative

Adding items to a cart in any order yields the same total. Catches accumulator and rounding-order bugs.

### PROP-3 — Loyalty ledger reconciles

For any sequence of accruals, redemptions, and clawbacks, `points_cache == sum(loyalty_ledger.delta)` and the derived tier matches the balance. This is INV-4 proven offline.

### PROP-4 — State machine safety

No random sequence of transition attempts can reach an illegal state, and no sequence can deduct materials twice for one order.

### PROP-5 — Idempotency

Any request replayed N times has the same effect as once, and returns the same response body.

### PROP-6 — Rounding conservation

`sum(line_total_minor) == total_minor` for any cart, at any discount, with no piastre created or destroyed by rounding.

---

## 4. Integration tests

Against a **real Postgres** (Docker Compose in CI, not an in-memory fake — RLS, triggers, `SERIALIZABLE`, and partial unique indexes do not exist in a fake).

| Suite | Asserts |
|---|---|
| Void transaction | Concurrent double-void produces exactly one return; the partial unique index fires; the transaction rolls back cleanly |
| Recipe-edit race | Send at T1, recipe edit at T2, void at T3 → return matches T1's quantities exactly |
| **Cross-tenant leak** | Tenant A's JWT returns **zero rows** from every one of tenant B's tables. Runs on every merge. This is the only thing between two cafés' books once multi-branch ships |
| Idempotency replay | Same key twice → one row, identical response, `Idempotency-Replayed: true` |
| Append-only enforcement | `UPDATE` and `DELETE` on ledger tables both fail — trigger *and* grant, independently |
| Payment recording | Exactly one `payments` row per order; every payment carries a staff actor; collection is idempotent under replay |
| **SSE replay** | Drop the connection mid-stream, reconnect with `Last-Event-ID` → no missed and no duplicated events; past the gap cap a `board.snapshot` is sent instead |
| DSR erasure | After erasure, no table contains the phone number, and every financial aggregate is unchanged |
| Job idempotency | Each scheduled job run twice produces the same end state |
| **Config bypass** | An owner-realm token cannot write a `setting_definitions` key marked `owner_editable = false`, cannot write outside a bounded key's range, and cannot raise its own entitlement — attempted directly against the API, not through the UI |
| **Menu publish atomicity** | A publish running concurrently with quote requests never lets a session observe a partially-applied revision; in-flight pinned versions keep their prices |
| **Archive guards** | Archiving a material referenced by an active recipe is refused; archiving a menu item preserves every report drill-down |
| **Impersonation limits** | An impersonation token is rejected for void, refund, price, cost, and plan mutations; a read-only session cannot write anything; a session past `expires_at` is rejected |
| **Platform role scoping** | `platform_support` cannot flip a flag or change an entitlement; `platform_engineer` cannot impersonate or touch billing |
| **Admin audit completeness** | Every mutating `/admin/*` route writes a `platform_audit` row; a route without one fails the suite. Enumerated from the OpenAPI document, so a new route cannot be added without an audit row |

---

## 5. Contract tests

A corpus of **recorded real payloads** in `packages/testkit`, replayed on every merge.

| Provider | Corpus includes |
|---|---|
| Meta | Text message, button reply, status update, media, **duplicate delivery**, out-of-order status, malformed body, wrong signature |
| Payments | **No provider, no contract to test** (ADR-0010). Replaced by integration tests: exactly one payment per order, every payment carrying a staff actor, no path to paid without a counter action, and idempotent collection under replay |
| Foodics | Order payloads, pagination edge, auth expiry |
| Claude | Prompt golden files; a schema-violating response asserting graceful degradation to the deterministic table |

With the PSP removed, the highest-risk contract left is Meta's, and the case that matters most is the **duplicate delivery**: Meta retries aggressively, and a webhook handler that is not idempotent turns one customer message into two orders. The corpus exercises it on every merge.

Our own contract is enforced by regenerating the OpenAPI document from the Zod schemas in CI and failing if it differs from the committed file — an undocumented breaking change cannot be merged.

---

## 6. Frontend testing

| Layer | Tool | Scope |
|---|---|---|
| Component | Vitest + Testing Library | Cart maths display, modifier selection rules, RTL rendering, empty and error states |
| Visual regression | Playwright screenshots | KDS board, Till grid, costing table — **in both `ar` and `en`**, both themes |
| Offline | Playwright with network interception | The Till offline suite (§7) |
| Accessibility | `axe-core` in component and E2E tests | WCAG 2.2 AA violations fail the build (NFR-42) |
| Performance | `size-limit` + Lighthouse CI on preview | JS ≤150 KB gz **fails** the build; mid-tier mobile throttling profile |
| i18n | Custom lint | A literal string in a rendered component fails the build (NFR-43) |

**The WhatsApp in-app browser is a manual gate.** It cannot be automated meaningfully and it behaves differently from Chrome around storage, back-navigation, and payment redirects. Every ordering-path change is verified inside it on both iOS and Android before merge (NFR-45). This is on the PR checklist, not in someone's memory.

---

## 7. The offline suite — its own section because it is where subtle data loss lives

```
1. Load Till online. Go offline.
2. Create 20 orders with modifiers. Send all to kitchen.
3. Attempt to mark one paid → must be blocked with a clear message (FR-4.10).
4. Kill and reload the app while still offline → all 20 orders survive.
5. Come back online.
ASSERT: exactly 20 orders on the server. No duplicates. No losses.
ASSERT: material_ledger has exactly one deduction set per order.
ASSERT: replaying the same outbox again creates nothing new.
6. Now go offline again mid-flush (partial sync) and recover.
ASSERT: same as above.
```

Step 6 is the one that finds real bugs. A clean offline→online transition is easy; a *partial* flush interrupted by a second disconnection is where duplicates are born, and it is exactly what café wifi does.

Runs on every merge (NFR-4, NFR-17).

---

## 8. E2E — seven journeys, and no more

Playwright, on merge to `main`, not per commit. Deliberately few: E2E tests are the slowest to run and the most expensive to maintain, and beyond a handful they buy less than the integration layer does.

1. **Order** — QR link → webview → modifiers → cart → payment (sandbox) → confirmation with ETA and points.
2. **Prepare** — ticket appears on KDS → advance to Ready → customer receives the ready message.
3. **Ring up** — Till order → send to kitchen → mark paid cash → appears in EOD.
4. **Void** — Till order → send → void with manager PIN → materials returned exactly → appears itemized in EOD.
5. **Close out** — EOD report reconciles cash, visa, voids, and footfall; digest figures match.
6. **Configure** — owner adds an item with a modifier and a recipe, prices it, reviews the diff, publishes, and the item is orderable in the customer webview. Covers the whole draft/publish path, which is the one place a bug would put wrong prices in front of customers.
7. **Provision** — a tenant is created from the Admin console, entitled, and reaches a first test order. This is the M5 gate as an executable test rather than a claim.

---

Seven, not five, after the console scope — but note the two additions are journeys whose failure modes are *wrong prices shown to customers* and *a GA gate that cannot be verified*, which is exactly the bar for earning a slot at this level.

## 9. Load testing

k6, before M5, at **10x pilot peak** (400 orders/hour sustained, 50 concurrent webview sessions, 5 KDS clients).

The purpose is **not** capacity — the capacity headroom here is enormous and known. It is to surface:
- N+1 queries that only appear with realistic data volume,
- Realtime subscription fan-out behaviour with multiple clients,
- connection-pool exhaustion under burst,
- job queue backpressure when the digest runs during a rush.

Anything that degrades non-linearly is a bug regardless of whether we will ever hit that load, because non-linear degradation means an unknown mechanism.

---

## 10. Game days — before M5

Each is executed against its runbook in `08-operations-runbooks.md`. **A runbook that has never been executed is fiction**, and the point of the exercise is as much to correct the runbook as to prove the system.

| # | Scenario | Must hold |
|---|---|---|
| GD-1 | Kill the whatsapp-web.js session mid-run | Habit Engine freezes and alerts within 5 min. Does **not** auto-reconnect. Ordering entirely unaffected |
| GD-2 | **Flood the New column** — 30 unaccepted orders during a simulated rush | The accept gate holds: nothing is deducted, stale-New alerts fire, bulk reject sends every customer a message, and the ledger shows zero movement for rejected orders (INV-7) |
| GD-3 | **Sever the SSE stream mid-rush** | `EventSource` reconnects, replays from `Last-Event-ID`, and the board is correct — no missed and no duplicated transitions. Staleness banner shows throughout the gap |
| GD-4 | Cut the Till's internet during a rush | Offline mode engages; 20 orders survive; clean sync on recovery |
| GD-5 | Restore the database from backup to a scratch instance | RTO ≤1h; all invariants pass post-restore |
| GD-6 | **Break the Admin console** (deploy a failing build to it), then flip `safe_mode` | The CLI path works, propagates in ≤60s, and writes a `platform_audit` row. This is the scenario NFR-57a exists for, and the one where an untested CLI path would be discovered at the worst moment |

Each game day ends with: what surprised me, what the runbook got wrong, what alert should have fired and did not.

---

## 11. The café day simulation — before the pilot's first real day

Not a test suite. An event, and the last gate before M3.

- Real pilot tablets, real café wifi, real staff, real menu.
- 50 scripted orders across 90 minutes, mixed WhatsApp and counter, including 5 voids, 3 modifier-heavy orders, 2 payment failures, and one deliberate wifi cut.
- I watch and take notes; I do not intervene unless the café would otherwise be stuck.

Every solo-built product that skips this discovers its worst bug in front of a paying customer. The bugs this finds are rarely code — they are workflow assumptions: where the tablet physically sits, whether the barista can read the screen with the espresso machine steaming, what the cashier does when two people order at once.

---

## 12. Merge gates

A PR merges only when **all** of:

- [ ] Typecheck, lint, format clean
- [ ] Unit + property tests pass; `domain` coverage ≥90% line / 100% branch
- [ ] Integration tests pass against real Postgres
- [ ] Contract tests pass
- [ ] Cross-tenant leak suite passes
- [ ] Offline suite passes
- [ ] `axe` finds zero violations
- [ ] `size-limit` within budget
- [ ] OpenAPI regenerates without diff
- [ ] No new `any` without an inline justification
- [ ] No literal string in a rendered component
- [ ] If the ordering path changed: **manually verified in the WhatsApp in-app browser on iOS and Android**
- [ ] If the schema changed: migration is expand/contract, and the previous image runs green against the new schema

The last two are manual and stay manual. They are the two that automation genuinely cannot cover, and they are both places where a miss reaches customers directly.

---

## 13. Production quality signals

Testing does not stop at deploy. These run forever:

| Signal | Cadence | On failure |
|---|---|---|
| **INV-1..INV-7** | Every 10 min | **Page** |
| Synthetic order (external prober) | Every 5 min | **Page** after 3 consecutive |
| ETA error p90 (NFR-12) | Hourly | Ticket |
| Payment success rate | Continuous | Page below threshold |
| Void rate anomaly (FR-4.11) | Nightly | Owner alert + ticket |
| Backup restore verification | Monthly | **Page** |
| Habit send cap and suppression compliance (INV-5) | Every 10 min | Page |

The invariants are the reason the numbers on the owner's dashboard can be trusted, and they are the part of this strategy that a reader should take away if they take away only one thing: **the most important tests in this system run in production, continuously, forever.**
