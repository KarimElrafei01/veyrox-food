# Veyrox Food — System Design

Companion to `00-master-plan.md`. This document is the architecture of record. If code and this document disagree, one of them is a bug.

---

## 1. Design principles

| # | Principle | Consequence |
|---|---|---|
| P1 | **One write path — and, since ADR-0002, one read path.** No client ever connects to Postgres at all. | Every mutation and every live update goes through `code/backend/api`. RLS remains as defence in depth, scoped by `SET LOCAL app.tenant_id`. |
| P2 | **History is append-only; state is derived.** | `material_ledger`, `order_events`, `loyalty_ledger`, `outbound_messages` are insert-only. Reports read history. |
| P3 | **Every external effect is idempotent and replayable.** | Idempotency keys on writes, dedupe keys on inbound webhooks, exactly-once semantics on outbound messages. |
| P4 | **Failure is a designed state, not an exception.** | Every dependency has a defined degraded mode (§7). |
| P5 | **Blast radius before capability.** | The habit rail is physically isolated. Feature flags gate every risky surface. |
| P6 | **Tenant-scoped from commit one.** | Every table carries `tenant_id`; every query is tenant-filtered; RLS enforces it even for read paths. |
| P7 | **Nothing runs that I cannot reproduce locally.** | No GUI-configured workflows, no cloud-only glue, no vendor CLI. `docker compose up` (Postgres + Redis) reproduces the whole system. |

---

## 2. Deployables

Six, plus one isolated worker host.

| Deployable | Runtime | Hosted on | Scales on | Notes |
|---|---|---|---|---|
| `code/backend/api` | Fastify / Node 22 | Phase 0: Hetzner VPS · Phase 1+: Fly.io `fra` ×2 | Requests | Single write path. Stateless. Also serves the WhatsApp webhook. |
| `code/backend/worker` | BullMQ workers / Node 22 | Same host as `api` (ADR-0011) | Queue depth | Same image as `api`, different entrypoint. Shares `@veyroxai/domain`. |
| `code/frontends/order` | Vite + React SPA | Cloudflare Pages | CDN | Customer webview opened from WhatsApp. Public, token-gated. Hardest perf budget. |
| `code/frontends/kds` and `code/frontends/till` | Vite + React SPA (PWA) | Cloudflare Pages | CDN | KDS + Till in one app. Offline-capable. Staff auth. |
| `code/frontends/console` | Vite + React SPA | Cloudflare Pages | CDN | **Store Console** — owner analytics, costing, and full configuration/CRUD. Auth-gated, no SSR needed. |
| `code/frontends/admin` | Vite + React SPA | Cloudflare Pages | CDN | **Platform Admin** — fleet operations. Separate deployable, separate auth realm, mandatory WebAuthn. See ADR-0014. |
| `habit-worker` | Node + whatsapp-web.js + Chromium | **Hetzner CX22, isolated** | n/a | Separate project, separate secrets, separate egress IP. See §8. |

`api` and `worker` share one Docker image so a domain-logic change cannot ship to one and not the other.

### 2.1 Why KDS and Till are one app

They run on the same class of device, in the same room, with the same auth, the same offline requirements, and the same SSE stream. Splitting them doubles the service worker, the outbox, the auth flow, and the deploy surface for zero benefit. They are two routes in `code/frontends/kds` and `code/frontends/till`, and a device is enrolled as `kds`, `till`, or `both`.

### 2.1a Why the Platform Admin is its own deployable

It reads every café's books, changes every price, and can disable every safety control. A bug or a stolen session on the Store Console is a single-tenant incident; the same on the Admin console is a fleet incident. A separate deployable means admin code and its dependencies are never shipped to a café owner's browser, and it can demand controls — a mandatory hardware key, four-hour sessions, no password fallback — that would be unreasonable to impose on a café owner. Full reasoning: ADR-0014.

It shares the same API (`/admin/*` routes), the same domain package, and the same CI pipeline. The isolation that matters is the bundle, the origin, and the auth realm — not the correctness core, which must stay singular.

### 2.2 Why the customer webview is separate

Different everything: unauthenticated (signed-token access), different perf budget (cold load over Egyptian mobile data, inside WhatsApp's in-app browser), different release cadence, and a different threat model. Bundling it with staff code would ship staff routes to the public and blow the perf budget.

---

## 3. Shared packages

```
packages/
  domain/        pure TS, zero deps — pricing, modifiers, ETA, loyalty,
                 recipe costing, ledger arithmetic, state machines,
                 and the three-layer feature resolver (ADR-0015)
  auth/          sessions, argon2id, TOTP, WebAuthn, device+PIN (ADR-0002)
  contracts/     Zod schemas → runtime validation + TS types + OpenAPI
  db/            Drizzle schema, migrations, typed query helpers
  ui/            design tokens, primitives, RTL-aware layout components
  i18n/          message catalogs (en default, ar-EG), formatting, RTL helpers
  observability/ OTel setup, logger, redaction rules
  testkit/       fixtures, factories, webhook replay corpus
```

**`packages/domain` is the crown jewel.** It is pure: no I/O, no clock, no randomness (both injected). Everything that decides a price, a cost, a quantity, or a tier lives there and nowhere else. The Till, the API, the analytics job, and the AI add-ons all call the same functions. This is the mechanism that prevents the classic failure where the dashboard and the receipt disagree by 0.25 EGP and nobody can say which is right.

---

## 4. Core domain flows

### 4.1 WhatsApp order (happy path)

```
1. Customer scans the store QR → wa.me deep link with prefilled greeting + store token
   (ONE code for the whole café — v1 has no per-table QR; see FR-1.1, DEC-01)
2. Customer sends → Meta → POST /webhooks/whatsapp
3. API verifies X-Hub-Signature-256, dedupes on message.id,
   INSERTs inbound_events, enqueues, returns 200 in <500ms  ← never do work inline
4. Worker resolves/creates customer, resolves tenant, checks store hours + flags
5. Worker sends greeting with a CTA-URL button:
     https://order.veyroxai.com/s/<signed_session_token>   (HMAC, 15-min TTL)
6. Customer opens webview → GET /public/session/:token → menu, availability, tier
7. Cart built client-side; every price re-computed SERVER-SIDE at placement ← never trust the client
8. POST /public/orders {session, items, idempotency_key}
     → open-order cap + no-show check (FR-2.23, FR-2.25)
     → domain.priceCart() → order (status=placed) + order_items with
       unit_price_minor + cost_snapshot_minor + recipe_version_id snapshots
     → NO payment. NO material deduction yet.
     → order_events row appended → pushed to KDS "New" column over SSE
9. Barista taps Accept → status=received  ← the gate that replaces prepayment
     → material_ledger deductions written (recipe_version_id stamped)
     → ETA clock starts → order_events append
   (or Reject → status=rejected, nothing deducted, polite message sent)
10. Worker sends confirmation: ETA range + "pay at the counter when you collect"
    + points to be earned
11. Barista advances ticket → status=ready → worker sends "ready" message (24h window, free)
12. Customer collects; cashier records Paid (Cash|Visa) → status=collected
     → loyalty_ledger accrual written in the same transaction
     (or, unclaimed past the window → abandoned; materials NOT returned, logged as waste)
13. T+30min after collection → BullMQ delayed job → review request (see 10-risk-containment.md)
```

**Step 7 is a security requirement, not an optimization.** The client sends item IDs and modifier IDs only. Prices, deltas, tier multipliers, and totals are computed server-side from the menu version pinned to the session. A client-supplied price is never read.

**Step 9 is the gate that replaces prepayment.** Nothing is deducted and nothing is made until a barista accepts. Under the original design, payment before preparation meant a no-show cost the café nothing; with cash on pickup, anyone with WhatsApp could otherwise make a café consume milk and barista time with no commitment. One tap restores that control, and lets the kitchen reject during a rush rather than silently accepting an order it cannot serve. See ADR-0010.

**Step 12 is the only place an order becomes paid**, and it always requires a staff actor at the counter. There is no path — no webhook, no client call, no redirect — by which an order pays itself.

### 4.2 Till order and the void

```
CREATE (offline-capable)          SEND TO KITCHEN                VOID
  local outbox row                 POST /orders/:id/send          POST /orders/:id/void
  idempotency_key (uuidv7)           BEGIN                          BEGIN
  optimistic UI                       lock order FOR UPDATE           lock order FOR UPDATE
                                      assert status=draft             assert status=pending
                                      status := pending               require manager PIN
                                      for each order_item:            insert NEGATION of every
                                        resolve recipe@version          material_ledger row where
                                        insert material_ledger          order_id = :id and
                                          qty_delta = -qty              reason='sale_deduction'
                                          reason='sale_deduction'       reason='void_return'
                                          recipe_version_id            reverse loyalty accrual
                                      append order_event              status := voided
                                    COMMIT                            append order_event(actor, reason)
                                                                    COMMIT
```

The void reads `material_ledger`, **never `recipes`**. That single choice is what makes PRD §8.4's acceptance criterion — "the sum of returned materials exactly matches the sum that was deducted at send-time" — a theorem rather than a hope, and it holds even if the owner edited the recipe in between.

Both endpoints are idempotent on `(tenant_id, idempotency_key)`. A double-tap, an offline replay, and a retry after a timeout all produce one effect.

### 4.3 Order state machine

With no payment provider (ADR-0010), both channels converge on **one** state machine:

```
 WhatsApp:  placed ──accept──► received ──► preparing ──► ready ──► collected(+paid)
              │                    │            │           │
              └──reject──►rejected └────────────┴──► voided │
                                                            └──► abandoned (waste)

 Till:      draft ──send to kitchen──► received ──► preparing ──► ready ──► collected(+paid)
                                          └──────────────────► voided
```

Rules, enforced in `domain/orderStateMachine.ts` and asserted in the DB by a trigger:

- Transitions are total and explicit; anything unlisted throws.
- **Re-entering the current state is a no-op returning 200**, not an error (P3, and baristas double-tap).
- **Materials are deducted exactly once, on entry to `received`** — the kitchen's Accept for both WhatsApp and Till orders. Sending a Till order creates `pending` and deducts nothing; an unaccepted order has consumed nothing.
- **`voided` returns materials** (exact ledger negation) and is reachable from `received`, `preparing`, and `ready` — always requiring a manager PIN.
- **`abandoned` does NOT return materials.** The drink was made; the milk is gone. It is recorded as waste, reported separately, and never counted as revenue. This distinction is the whole reason both states exist.
- **`rejected` deducts nothing and returns nothing**, because Accept never happened.
- **Payment and collection are the same event.** `collected` requires a `payment_method` and a staff actor; there is no path to paid without one. Loyalty accrues in that transaction.
- Every transition appends an `order_events` row with actor, source, and reason. The events table is the audit log.

The convergence is a genuine simplification over the prepayment design: one machine instead of two, one payment moment, no `pending_payment` limbo, and no reconciliation between a provider's view of an order and ours.

**Authoritative Till flow (2026-09-06):** `draft → pending → received → preparing → ready → collected`. Send to Kitchen makes the order `pending`; kitchen Accept moves it to `received` and writes the `sale_deduction` rows. A pending ticket can be rejected with no material movement, while void is available only after `received`.

### 4.4 ETA computation

```ts
// packages/domain/eta.ts — pure, injected clock
prepSeconds(cart)   = max(item.prep_s) + 0.4 * sum(other items' prep_s)   // capped at 900
queueSeconds(state) = (Σ remaining prep in RECEIVED + PREPARING) / activeStations
etaSeconds          = prepSeconds + queueSeconds
display             = range(round5(eta * 0.9), round5(eta * 1.25))        // e.g. "8–12 min"
```

`activeStations` is set by the KDS (barista count) and defaults to 1. `remaining prep` for an in-progress ticket decays linearly from its estimate. Queue depth arrives over the same SSE stream the KDS uses, so the number the customer sees and the number on the board come from one source (PRD §8.3 P0).

**ETA accuracy is an SLI**, not a nicety: `eta_error_seconds` is recorded on every completed order as `actual_ready − promised_upper`, and NFR-7 alerts if p90 drifts beyond ±5 min.

### 4.5 Loyalty

Points live in an append-only `loyalty_ledger` (`+accrual`, `−redemption`, `−clawback`), never a mutable balance column. Balance and tier are computed, then cached in `customers.points_cache` for display only, refreshed inside the same transaction that appends. Tier thresholds and multipliers come from `domain/loyalty.ts`, matching PRD §8.2:

| Tier | Points | Multiplier | Perk |
|---|---|---|---|
| Bronze | 0–150 | 1.0x | — |
| Silver | 151–500 | 1.2x | Free alt-milk |
| Gold | 501+ | 1.5x | Priority prep (ticket sorts first on KDS) |

A tier crossing detected during accrual enqueues the celebration message. **Void and refund clawback** (FR-8.3, added at P1 — the PRD omits it) appends a negative row; the ledger makes this trivially correct and auditable, which a mutable balance column would not.

---

## 5. Data architecture

Full schema: `04-data-model.md`. The structural decisions:

1. **One Postgres, tenant-scoped.** `tenant_id` on every row, RLS on every table, a composite index leading with `tenant_id` on every hot path.
2. **Append-only cores**: `material_ledger`, `loyalty_ledger`, `order_events`, `inbound_events`, `outbound_messages`. No `UPDATE`, no `DELETE`. Corrections are compensating rows.
3. **Versioned reference data**: `recipes` and `menu_item_prices` are versioned with `valid_from`/`valid_to`. Order lines snapshot the version they used.
4. **Money as integers** (`*_minor`, piastres). **Costs as `NUMERIC(14,6)`** because a gram of milk costs a fraction of a piastre. Rounding happens once, at display. [ADR-0007]
5. **Read models as materialized views** refreshed by cron for the console's heavy panels (weekly item analytics, material usage). At this volume plain views would work; matviews exist so the console stays fast as cafés accumulate history and so the refresh is a schedulable, observable job rather than a slow page.
6. **`vw_habit_targets`** — a single, narrow, read-only view (phone, first name, usual item, discount code) that is the *only* thing the isolated habit worker can see. It has its own database role with `SELECT` on that view and nothing else.

---

## 6. Background jobs

All BullMQ on Redis. All repeatable jobs declare `tz: 'Africa/Cairo'`. **Egypt observes DST (April–October); a UTC cron would drift the 22:00 digest by an hour twice a year.** [ADR-0004]

| Job | Schedule | Purpose | Failure mode |
|---|---|---|---|
| `whatsapp.inbound` | on demand | Process deduped inbound webhook events | Retry ×5 exponential, then DLQ + ticket |
| `whatsapp.outbound` | on demand | Send official-rail message, record `outbound_messages` | Retry ×3; template failures never retry blindly (cost) |
| `order.abandon` | every 5 min | Move orders sitting in `ready` past the abandon window to `abandoned` (waste; **no material return**) | Idempotent; safe to run twice |
| `order.stale_new` | every 2 min | Alert staff to unaccepted `placed` orders older than 2 min (FR-3.13) | Non-paging |
| `review.request` | delayed, T+30m from `collected` | Review Shield prompt (PRD §8.6) | Skipped if order refunded/voided |
| `digest.nightly` | 22:00 Cairo daily | Compute + send owner digest (Utility template) | Alert on failure; digest is a trust surface |
| `matview.refresh` | 03:00 Cairo daily + every 15 min for today | Refresh analytics read models | Non-paging |
| `eta.calibrate` | 03:30 Cairo daily | Recompute per-item p50 prep times from observations | Non-paging; falls back to previous values |
| `invariant.check` | every 10 min | INV-1..INV-5 (§9) | **Pages on violation** |
| `void.anomaly` | 23:30 Cairo daily | Staff void-rate outliers → owner alert | Non-paging |
| `habit.rule1` | 08:15 Cairo daily | Morning re-order nudge (PRD §8.7 Rule 1) | Isolated worker; see §8 |
| `habit.rule2` | 21:00 Cairo daily | Win-back check-in (PRD §8.7 Rule 2) | Isolated worker; see §8 |
| `backup.verify` | monthly | Restore latest PITR snapshot to a scratch DB, run invariants | **Pages on failure** |
| `dsr.purge` | 02:00 Cairo daily | Execute due data-subject deletions (PDPL) | Non-paging, audited |

Every job is idempotent, records a `job_runs` row (started, finished, outcome, item counts), and has a run-once-manually CLI entrypoint for debugging.

---

## 7. Failure modes and designed degradation

This table *is* the reliability design. Each row is a game-day scenario in `07-test-and-quality-strategy.md` and a runbook in `08-operations-runbooks.md`.

| Dependency down | Detection | Degraded behaviour | Customer/staff impact |
|---|---|---|---|
| **Meta Cloud API** | Send failures, webhook silence > 10 min | Outbound queued and retried with backoff; ordering webview still reachable by direct link; Till unaffected | New WhatsApp orders stop; counter keeps trading |
| ~~Payment provider~~ | — | **Not applicable in v1.** There is no PSP to fail (ADR-0010). Cash on pickup has no external dependency at all, which removes the second-largest availability risk from the ordering path | — |
| **SSE stream** | Client heartbeat gap > 25s (heartbeat is 20s) | `EventSource` auto-reconnects with `Last-Event-ID`; server replays missed `order_events`; past the gap cap, one full board snapshot instead. Staleness banner shows throughout | Brief banner, no lost transitions |
| **Postgres** | Health check, connection errors | API returns 503 with a clear message; Ops SPA runs fully offline from cache + outbox; nothing is lost | Till keeps taking orders; syncs on recovery |
| **Café internet** | Client offline event | Outbox queues; KDS shows last-known board with a prominent staleness banner; payment marking disabled | Staff work on paper for card payments only |
| **Redis** | Worker health | API keeps serving; jobs pause and resume; delayed jobs survive (persistent Redis) | Digest/review may be late |
| **whatsapp-web.js banned** | Session probe every 5 min | Habit Engine freezes, alerts, **does not auto-reconnect**; flag flips to Cloud API impl when ready | Retention messages pause; ordering untouched |
| **Claude API** | Error/timeout | AI narrative omitted; the deterministic table is sent alone | Digest is plainer, still correct |

Two rules make this work: **the ordering loop depends on nothing that is not on the critical path**, and **every optional feature has a flag that removes it cleanly**.

---

## 8. The isolation boundary (R1)

Design detail in `10-risk-containment.md`; the architecture:

```
  ┌─ Main environment (VPS → Fly, Neon) ───┐   ┌─ Habit environment (Hetzner) ─┐
  │  api, worker, Postgres, Redis          │   │  habit-worker                 │
  │  Meta Cloud API creds                  │   │  whatsapp-web.js + Chromium   │
  │  (no payment provider — ADR-0010)      │   │  persistent volume (session)  │
  │                                        │   │                               │
  │  role: veyroxai_app  (full)              │   │  role: habit_reader           │
  │                                        │   │    SELECT on vw_habit_targets │
  │                                        │   │    ...and nothing else        │
  └───────────┬────────────────────────────┘   └────────────┬──────────────────┘
              │                                             │
              │  POST /internal/habit/report  (mTLS,         │
              │◄──── outcome rows only: sent/failed/replied ─┘
```

Properties, each deliberate:
- **Different host, different provider, different egress IP.** A Meta-side association between the ordering number and the automated number is one of the known ban vectors.
- **The habit worker holds no credential that can write anything.** Its DB role can read four columns of one view. It reports outcomes back through a narrow authenticated endpoint, not by writing to the database.
- **Send outcomes are recorded on the main side** so opt-outs, weekly caps, and G5 measurement live with the rest of the data and survive the habit host being destroyed and rebuilt.
- **The habit host is cattle.** Rebuilt from Terraform + cloud-init in under 30 minutes, with a documented re-pairing procedure for the new number.

---

## 9. Invariants (continuously asserted)

Checked by `invariant.check` every 10 minutes. Any violation pages.

| ID | Invariant | Why it matters |
|---|---|---|
| **INV-1** | For every `voided` order and every material: `sum(qty_delta) = 0` | PRD G4 and §8.4 acceptance criterion. The core correctness claim. |
| **INV-2** | For every non-voided order: `sum(qty_delta) < 0` for each material in its recipe, and no `void_return` rows exist | Catches partial or spurious returns. |
| **INV-3** | `orders.total_minor = sum(order_items.line_total_minor) − discounts` for every order | Catches pricing drift between line and header. |
| **INV-4** | `customers.points_cache = sum(loyalty_ledger.delta)` for every customer | Catches cache divergence before a customer sees a wrong balance. |
| **INV-5** | No `outbound_messages` row on the habit rail violates the per-customer weekly cap or the suppression list | PRD §8.7 P0 anti-spam, and PDPL opt-out. |
| **INV-6** | No order is both paid and voided/rejected/abandoned; every `collected` order has exactly one payment record with a method and a staff actor | Catches double-recording and orders closed without attribution. Replaces the double-capture check, which had no meaning once the PSP was removed. |
| **INV-7** | No `abandoned` order has `void_return` ledger rows; no `rejected` order has any ledger rows at all | The waste-vs-return distinction (ADR-0010) is the easiest thing here to break with a well-meaning refactor. |

These are not tests. They run in production, forever, and they are the reason the numbers on the owner's dashboard can be trusted.

---

## 10. Security architecture

Full treatment in `09-security-privacy-compliance.md`. Structural points:

- **Four auth realms, all custom, all in `code/backend/api`** (ADR-0002). (a) *Customer*: no account; an HMAC-signed, 15-minute, single-session token bound to `wa_id + tenant_id + menu_version`. (b) *Staff*: device enrollment (long-lived device token in secure storage) + per-staff PIN for attributable actions; manager PIN for voids, refunds, and price edits. (c) *Owner*: email + password (argon2id) with TOTP required before GA. (d) *Platform admin*: **mandatory WebAuthn hardware key, no password fallback**, 4-hour sessions, scoped platform roles, `reason` required on every mutation (ADR-0014). All four share one session-issuing module and one argon2id/JWT primitive set — three were always going to be bespoke, which is why buying the fourth stopped making sense.
- **Impersonation** is read-only by default, write-mode requires escalation and is time-boxed to 30 minutes, is always visible in a banner, is attributed as `platform_user` rather than disguised as the owner, appears in the **tenant's own** audit log, and can never void, refund, or change a price, cost, or plan. See `13-admin-and-configuration.md` §6.
- **JWT claims** carry `tenant_id` and `role`, issued by our own session module. The API opens each request transaction with `SET LOCAL app.tenant_id`, and RLS policies read `current_setting('app.tenant_id')`. **RLS is now defence in depth rather than the primary control**, since no client touches Postgres — it guards against a leaked connection string or a query that forgets its `WHERE`, and it is what stands between two cafés' books when multi-branch ships. The cross-tenant leak suite still runs on every merge.
- **Secrets** in the host environment (Hetzner env / Fly secrets from Phase 1), never in the repo; rotation runbook documented. The habit environment shares no secret with the main environment.
- **PII discipline**: phone numbers are the primary personal data. They are stored E.164, indexed by a keyed hash for lookup, and **never logged**. `packages/observability` installs a redaction layer that strips phone-shaped strings, message bodies, and tokens from logs and traces at emit time, not at query time.
- **PCI**: out of scope entirely. v1 has no payment provider and no card flow (ADR-0010); the Till's "Visa" label records a transaction taken on the café's own standalone terminal, which we never touch.

---

## 11. Environments and delivery

| Env | Purpose | Data | Deploy |
|---|---|---|---|
| `local` | `docker compose up` (Postgres + Redis) | Seeded fixtures | — |
| `preview` | Per-PR ephemeral, on a **Neon branch** | Branched from staging schema, seeded | Automatic on PR |
| `staging` | Pre-prod, synthetic traffic generator, all invariants running | Synthetic only, never production data | Automatic on merge to `main` |
| `production` | Live cafés | Real | Manual promote from a green staging build |

**Pipeline** (GitHub Actions): typecheck → lint → unit + property tests → build → integration tests against real Postgres → E2E on preview → migrate staging → deploy staging → smoke → *manual gate* → migrate production → deploy production (Fly rolling, health-checked) → smoke.

**Migrations are forward-only and expand/contract.** Never a destructive change in the same release as the code that stops using the column. The three-step rhythm — add, backfill and dual-write, drop in a later release — is mandatory, because the rollback path for a solo operator at 08:30 must be "redeploy the previous image", and that only works if the old code still runs against the new schema.

**Rollback**: `fly deploy --image <previous>` for the API, Cloudflare Pages instant rollback for the SPAs, and the previous migration is never needed because of the rule above.

---

## 12. Observability

- **Traces** (OTel → Tempo): every request, job, and outbound call. `trace_id` propagates from the webview through the API into jobs and into the WhatsApp send, so "why did this customer not get their ready message?" is one query.
- **Metrics** (Prometheus): RED on the API, queue depth and job latency, plus **business metrics as first-class signals** — orders/hour, void rate, ETA error, payment success rate, habit send outcomes. A business metric anomaly usually precedes a technical alert.
- **Logs** (Loki): structured JSON, redacted at emit, always carrying `tenant_id`, `trace_id`, and where relevant `order_id`.
- **Errors** (Sentry): API and all five SPAs, source-mapped, release-tagged.
- **Dashboards**: one *Café Health* board (the one I look at during a rush: orders, queue depth, ETA error, error rate, open SSE connections) and one *System Health* board.

The rule: **if an incident cannot be diagnosed from the Café Health board plus one trace, the instrumentation is the bug.**
