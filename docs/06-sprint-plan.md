# Veyrox Food — Sprint Plan

**Solo build. Two-week sprints. 18 sprints to M6.**

> **Revised 2026-09-05**, twice:
> 1. Absorbed the Store Console (configuration + CRUD) and the Platform Admin — `13-admin-and-configuration.md`. **Two sprints added**; M3 slips 2 weeks, M5 slips 4.
> 2. Removed the payment provider (ADR-0010) and the per-table QR. **Roughly two-thirds of a sprint returned**, mostly out of S2, partly reinvested in the kitchen-accept gate and no-show controls that replace prepayment.
>
> Net effect and the reasoning: §7.

---

## 1. How this plan is calibrated

One engineer, assumed at **~55 productive hours per sprint** on feature work after accounting for support, ops, integration friction with third parties, and the reality that some weeks are worse than others. That is a deliberately conservative number: solo plans fail because they are built on the best week rather than the median one.

Each sprint carries an explicit **exit criterion**. A sprint is not done when the tickets are closed; it is done when the exit criterion is demonstrable. If a sprint misses its exit criterion, the *next* sprint absorbs the overflow and the cut list (§4) is consulted — the milestone dates do not move first.

Two rules make this survivable solo:
- **Every sprint ends with something deployed to staging that works end to end.** Never a sprint of pure plumbing with nothing demonstrable.
- **Every sprint reserves ~15% for the previous sprint's discovered work.** It is always there; pretending otherwise just moves the lie forward.

---

## 2. Sprint-by-sprint

### Sprint 0 — Foundations *(weeks 1–2)* → **M0**

Nothing here is a feature, and all of it is load-bearing. Every day spent on this later costs three.

- Monorepo (pnpm + Turborepo), TypeScript strict, lint, format, commit hooks.
- `packages/domain` skeleton with the branded `Minor` money type and the lint rule banning raw numbers in money positions (NFR-18, NFR-60).
- `packages/db`: Drizzle schema for tenants, menu, orders, order_items, **`material_ledger`**, `order_events`. Migration tooling. Seed script for the pilot menu.
- Neon project + `docker compose` local stack; RLS baseline policies (defence in depth, `SET LOCAL app.tenant_id`); **cross-tenant leak test suite** (green from day one, so it never has to be retrofitted).
- Fastify API skeleton with Zod contracts, OpenAPI generation, problem-details errors, idempotency middleware.
- CI/CD: typecheck → test → build → integration-against-real-Postgres → deploy staging. Fly.io app, Cloudflare Pages projects, secrets management.
- OTel + Grafana Cloud + Sentry wired, **with the log redaction layer in place before the first phone number is ever written** (NFR-35 — retrofitting redaction means auditing every log line ever added).
- **Fiwano account + CTA-URL button confirmed** (ADR-0016 — day-one question; the entry flow depends on it). Test WhatsApp number connected, webhook verified.
- `MessagingChannel` adapter with `FiwanoChannel`, so the provider is swappable from commit one.
- **Start Meta Business Verification for Veyrox AI** — free, weeks-long, blocks nothing, required whenever we go direct.
- **Walking skeleton**: inbound WhatsApp message → webhook → order row → ticket visible on a deployed KDS stub.

**Exit**: M0. A message sent from my phone appears as a ticket on a deployed page in under a second, and I can roll the whole thing back with one command.

---

### Sprint 1 — Menu, pricing, and the webview shell *(weeks 3–4)*

- Menu domain: categories, items, modifier groups/options, **versioned prices**, availability.
- `domain.priceCart()` — modifiers, tier waivers, totals. **Full unit + property test coverage here before any UI exists.** This function is the reason the receipt and the dashboard will agree.
- `code/frontends/order` shell: routing, i18n (`en` default + `ar-EG`) with **RTL correct from the first screen**, design tokens, perf budget wired into CI as a failing check.
- Menu browse + item detail + modifier selection + cart, all local.
- `POST /public/orders/quote` returning prices and availability.
- **Q5 closed**: English-primary, Arabic secondary. `name_en` required, `name_ar` optional with fallback; RTL still built from the first screen.

**Exit**: I can browse the pilot menu on a real phone in both English and Arabic (RTL correct), build a cart with modifiers, and see a server-computed total that matches a hand calculation.

---

### Sprint 2 — Order placement, confirmation, no-show controls *(weeks 5–6)*

**Substantially smaller than planned.** v1 has no payment provider (ADR-0010), so intention creation, hosted checkout, HMAC callback verification, webhook idempotency, and the reconciliation job are all gone — roughly a sprint of the riskiest integration work in the plan. Part of the saving is reinvested in the controls that replace prepayment.

- Session tokens (HMAC, TTL, single-tenant binding).
- `POST /public/orders`: server-side re-pricing, snapshot columns, status `placed`. **No payment, no material deduction yet.**
- Order confirmation message on the official rail, carrying "pay at the counter when you collect"; store-hours and closed-state handling (FR-2.3).
- **No-show controls**: open-order cap, `order.abandon` job with the waste-not-return rule, no-show counter and step-down (FR-2.23–2.25).
- Loyalty accrual and tier logic in `domain`; accrual wired to the collection transaction.
- Optional table-number field behind `ordering.ask_table_number`, default off (FR-1.7).
- **Q7, Q8 closed**: table prompt off by default; abandon at 30 min, no-show step-down at 3 / 90 days. All three are bounded owner settings, tunable without a deploy.

**Exit**: An order placed from the webview appears on the KDS as **New** with nothing deducted; the customer gets a confirmation naming the counter as the payment point; an unclaimed ready order auto-abandons and shows as waste, not as a material return.

---

### Sprint 3 — KDS, realtime, ETA *(weeks 7–8)* → **M1**

- Order state machine in `domain`, with the DB trigger and the "re-entry is a no-op" semantics (FR-3.5).
- `packages/ops-core`: device enrollment, staff PIN, **SSE stream with `Last-Event-ID` replay and gap-cap resync**, staleness banner (FR-3.6, ADR-0005) — built once, consumed by `code/frontends/kds` and `code/frontends/till`.
- KDS four-column board (**New** / Received / Preparing / Ready), tap-to-advance, 60-second undo, Gold priority sort.
- **Kitchen-accept gate** (FR-3.11–3.13): Accept deducts materials and starts the ETA clock; Reject sends a polite message and deducts nothing; stale-New escalation.
- Auto "order ready" message on transition to `ready`.
- Cashier records collection + payment method, closing the order and accruing loyalty in one transaction.
- ETA v1 (`domain/eta.ts`) with queue depth from the live board; range display; `eta_error_seconds` recorded on every order.
- Confirmation message carries the ETA range and points earned.

**Exit**: **M1.** Someone who is not me orders a real drink from the store QR, a barista accepts it, they are told when it is ready, and they pay at the counter — with me out of the room.

---

### Sprint 4 — Cashier Till and offline *(weeks 9–10)*

- Till UI: flat grid, running cart, speed-optimized (FR-4.1), tested on the actual pilot tablet.
- `POST /orders` (draft), `send-to-kitchen` (`pending`), and kitchen Accept (`received`) with **material deduction writing `sale_deduction` rows stamped with `recipe_version_id` only on Accept**.
- Recipes and raw materials schema + seeding; recipe versioning.
- **Offline outbox**: IndexedDB queue, UUIDv7 idempotency keys, optimistic UI, background flush, server-side dedupe. Payment marking explicitly excluded from optimistic handling (FR-4.10).
- Service worker, app shell caching, offline indicator.
- **Q3 closed — e-invoicing is v2.** Receipt records still carry the e-invoicing fields (tax registration number, item tax codes, document UUID) so v2 is an integration rather than a re-model. No submission work in v1.

**Exit**: The Till takes 20 orders with wifi physically off, then syncs on reconnect with zero duplicates and zero losses — verified by an automated offline E2E test, not by hand.

---

### Sprint 5 — Void, EOD, and the invariant *(weeks 11–12)* → **M2**

The most important sprint in the project.

- Staff/manager PIN authorization; `staff` and `devices` tables; attribution on every order mutation (FR-4.6).
- **Void**: exact ledger negation with `reverses_ledger_id`, the partial unique index, `SERIALIZABLE` transaction, loyalty clawback, `order_events` audit.
- **Property-based test suite** (fast-check) over arbitrary interleavings of orders, recipe edits, and voids, asserting INV-1 holds always.
- `invariant.check` job running INV-1..INV-7 every 10 minutes, with paging alerts and the `invariant_violations` table.
- EOD report: cash/visa counts and totals, void count, **itemized returned materials**; close-out with `footfall_estimate` (FR-4.7a) and the unsynced-orders block (FR-4.7b).
- Payment-method rollup in `domain`, shared by EOD and the digest — one query, no duplicate counters (FR-8.1).
- Staging synthetic traffic generator so the invariants have something to chew on continuously.

**Exit**: **M2.** INV-1 green for 7 consecutive days on staging under synthetic load, *including* runs where recipes are edited mid-order. The EOD report reconciles to the piastre.

---

### Sprint 6 — Owner console, digest, Review Shield *(weeks 13–14)*

- `code/frontends/console` shell: custom owner auth (argon2id + TOTP), tabs, the **`dataScope`-required panel wrapper** (FR-5.25).
- Item Analytics: ranked units sold, revenue, material usage from the ledger. Matviews + refresh job.
- Nightly Digest: computation, Utility template, 22:00 **`Africa/Cairo`** BullMQ repeat, failure alerting.
- **Submit the digest template to Meta this sprint** — four sprints before it is needed, so R6 surfaces early.
- Review Shield: delayed job at T+30m from `collected`, rating capture, gated routing, immutable `review_requests` audit trail, per-tenant flag, **and the compliant variant built behind the same flag** (FR-6.5).
- Product analytics events for G2 measurement (FR-5.9).
- **Admin thin slice (~3 days)**: tenant provisioning, global flags with reason and audit, the invariant/health view, order lookup. Replaces the manual SQL and seed scripts I would otherwise run against production during the pilot — and running SQL against production during an incident is how data gets damaged (RB-3).

**Exit**: A full simulated day produces a digest on WhatsApp whose every figure matches the console and the EOD report. A second tenant can be created without touching the database.

---

### Sprint 7 — Store Console: configuration & CRUD *(weeks 15–16)*

**New sprint.** This is a pilot blocker, and it was previously hidden: the plan seeded the pilot menu with a script, which works once and makes the M5 "zero code changes" gate unreachable.

- `setting_definitions` registry and the **three-layer resolver** in `packages/domain` (FR-10.1, FR-10.2); resolved-state delivery to all clients; fail-safe defaults.
- Menu CRUD: categories, items, modifier groups and options; **draft workspace, diff view with margin impact, atomic publish** to a new `menu_version` (FR-10.12).
- Materials CRUD with **versioned cost edits** and the impact preview (FR-10.15) — the rail that catches a mistyped per-gram decimal.
- Recipe editor with modifier-conditional lines, live cost/margin, placeholder-cost flagging, and the **recipe library** seed (FR-10.17).
- Archive-not-delete semantics and referential blocks (FR-10.10, FR-10.11).
- Store settings: hours, closures, store QR download and regeneration, receipt, locale. Staff and device CRUD with in-store roles (FR-10.21).
- Owner feature toggles from the registry; **system status panel** (FR-10.22); owner audit log including platform actions.

**Exit**: I add a seasonal drink with a modifier, a recipe, and a price — as the owner, in the console, with no SQL — publish it, and order it from a phone. Last month's margin report is byte-identical before and after (NFR-19).

---

### Sprint 8 — Recipe Costing *(weeks 17–18)* → **M3**

- Material cost management, **versioned on edit** (FR-5.10), with `source` including `placeholder`.
- Per-item cost/price/margin with modifier-aware costing (FR-5.12); colour coding; weekly ingredient spend.
- **The placeholder-cost rendering rule** (FR-5.14): no margin renders while any contributing cost is a placeholder.
- No-POS / Has-POS toggle and scope banners (FR-5.22–5.25).
- Pilot readiness: runbooks written and *rehearsed*, staff training material in Arabic, printed QR sheets, tablet provisioning, the **café day simulation** (50-order scripted rush on real hardware, real wifi, real staff).
- **Blocking on a signed café**: Q2 (real supplier prices) and Q6 (R1/R2 disclosure) are hard M3 gates. Until a café signs, every seed cost stays `source=placeholder` and the console renders no margin (FR-5.14).

**Exit**: **M3.** Brew & Baladi runs limited hours on the real system. Zero placeholder costs exist in production. Rollback rehearsed.

---

### Sprint 9 — Pilot hardening *(weeks 19–20)*

Deliberately under-planned. Real pilot feedback will fill it, and a sprint with no slack during the first two weeks of live operation is a sprint that ends in a fire.

- Bug triage from live use, prioritized by whether it costs the café money or time.
- ETA v2: `eta.calibrate` job replacing static prep times with observed p50 per item per hour bucket; NFR-12 dashboard.
- Performance on the real tablet and real wifi; whatever the perf budget actually broke on.
- Void anomaly detection (FR-4.11); cash refunds for paid orders (FR-4.8); tuning the abandon window and no-show thresholds against real pilot data.
- **Blocking**: Q4 (habit number ownership, registered to the operating entity) before S10.

**Exit**: A full week of unassisted café operation with no page-level incidents, no manual data correction, and **no configuration change made by me on the café's behalf**.

---

### Sprint 10 — Habit Engine *(weeks 21–22)* → **M4**

- Hetzner host provisioned via Terraform + cloud-init; `habit_reader` role; `vw_habit_targets`; mTLS report endpoint.
- whatsapp-web.js worker: session persistence on a volume, health probe every 5 min, **freeze-not-reconnect** on auth failure (FR-7.10).
- `HabitChannel` interface; **both** implementations built; Cloud API templates **submitted and approved** before the rail goes live (FR-7.11).
- Rules 1 and 2 with targeting queries, the weekly per-customer cap, the daily global cap, jitter, and send-window enforcement.
- Opt-out across both rails (FR-7.5); INV-5 wired into `invariant.check`.
- Single-use attributed discount codes (FR-7.6); reply correlation for G5 (FR-7.7).
- Kill switch, verified end to end.

**Exit**: **M4.** Kill switch stops sending within 60s, proven by test. A customer messaged Monday cannot be messaged again before the next Monday, proven by test and asserted in production. The fallback channel is approved and one flag away.

---

### Sprint 11 — Retention polish and P1 features *(weeks 23–24)*

- Upsell (FR-2.12) and cross-sell (FR-2.13), with the insufficient-data suppression rule.
- "Simulate +10% ingredient" (FR-5.15); margin history sparklines.
- LLM digest narrative (FR-5.6) with strict number-passing, schema validation, and spend caps.
- Data export (FR-9.7); DSR access/erasure flow (NFR-38) with its integration test.
- Console charting.

**Exit**: All P1 features from Phases 1–4 shipped, or explicitly cut with the reason recorded.

---

### Sprint 12 — Platform Admin, full *(weeks 25–26)*

**New sprint.** Placed deliberately **before** GA: going live with multiple cafés without fleet tooling means operating them by hand, which does not scale past about three and is where data gets damaged.

- Separate `code/frontends/admin` deployable; platform auth realm with **mandatory WebAuthn**; `platform_owner` / `platform_support` / `platform_engineer` roles; `reason` required on every mutation; `platform_audit` append-only (FR-11.1–11.4, FR-11.20).
- **CLI parity** for every mutating action, sharing the same domain functions — the console must never be the only path to a kill switch (FR-11.4).
- Tenant lifecycle: provisioning in one action, onboarding progress, graceful suspension (FR-11.5–11.7).
- Entitlements and plans with the four states, including `preview` running the **same computation** as the paid product (FR-11.10).
- Flags: global kill switches, per-tenant overrides, percentage rollout, broadcast to tenant status panels (FR-11.8, 11.9).
- **Rails control**: official-rail numbers, quality, template registry and spend; habit-rail health, caps, ban log, **Freeze** and **Channel switch** — making RB-8 executable under stress rather than a flag key someone has to remember (FR-11.11).
- Fleet health with cross-tenant invariant violations at the top (FR-11.12).
- Support tooling: order lookup timeline, message log, one-click idempotent payment reconciliation, ledger inspector (FR-11.13).
- **Impersonation** with the full control set: read-only default, escalation with reason, 30-minute time-box, persistent banner, platform attribution, tenant-visible, never for money (FR-11.14).
- Destructive-operation rails; **no UI path to tenant deletion** (FR-11.15, 11.16).

**Exit**: A new café is provisioned, entitled, onboarded, and taken live entirely from the Admin console with no SQL and no deploy. `review_gating` flips off globally in under 60 seconds and no owner can re-enable it.

---

### Sprint 13 — Hardening for GA *(weeks 27–28)* → **M5**

- Independent security review (ASVS L2) and accessibility audit; remediation.
- Load test at 10x pilot peak (k6); fix whatever N+1 it exposes.
- **Game day**: kill the WhatsApp session, drop Realtime, cut the Till internet, break the Admin console, fail a database restore. Each against its runbook; each runbook corrected afterwards.
- Backup restore drill automated and scheduled monthly (NFR-22).
- Tenant self-onboarding path (FR-9.6).
- **Onboard cafés #2 and #3 from the Admin console with zero code changes** — the actual GA test, now genuinely testable.
- Admin surface included in the security review scope, since it is the highest-privilege surface in the system.

**Exit**: **M5.** GA on the no-POS track. Error budget intact for 30 days.

---

### Sprints 14–17 — AI layer and Has-POS *(weeks 29–36)* → **M6**

The add-on preview framework and entitlements already exist from S12, so these sprints are the models themselves rather than the plumbing around them.

| Sprint | Scope |
|---|---|
| **S14** *(29–30)* | **Demand Forecasting & Waste**: day-of-week × hour profile, EWMA, Ramadan/holiday calendar, prediction intervals, perishable-vs-staple ordering policy. |
| **S15** *(31–32)* | **Menu Engineering** (deterministic quadrants, explainable). **Off-Peak Pricing** with unsigned-discount enforcement making surcharges structurally impossible (FR-5.19). |
| **S16** *(33–34)* | **Ramadan Labor Scheduling** (constraint solver, editable output). AI output audit storage (FR-5.21). LLM digest narrative if not already shipped. |
| **S17** *(35–36)* | **Foodics read integration**: OAuth, scheduled pull, source-tagged staging, scope banners enforced end to end, stale-sync banner. Has-POS onboarding flow. |

**Exit**: **M6.** All four add-ons behind entitlement flags with live previews from the tenant's own data; a Foodics-connected café sees correctly-scoped analytics and can never mistake partial data for complete.

---

## 3. Dependency-driven ordering

The sequence is not arbitrary. These are the hard edges:

```
S0 foundations
 └─ S1 pricing domain ──┬─ S2 checkout ── S3 KDS+ETA ─── M1
                        │                    │
                        └─ S4 Till ──────────┘
                             │
                             └─ S5 ledger + void + invariants ─── M2
                                   │
                                   ├─ S6 analytics + digest + admin thin slice
                                   │     └─ S7 Store Console CRUD (needs menu+recipe+material schema)
                                   │           └─ S8 costing (needs ledger + real costs) ─── M3
                                   │                 └─ S9 pilot data
                                   │                       └─ S10 Habit Engine (needs history to target)  ─── M4
                                   │                             └─ S11 P1 polish
                                   │                                   └─ S12 Platform Admin (full)
                                   │                                         └─ S13 hardening ─── M5
                                   │                                               └─ S14–S16 AI
                                   └───────────────────────────────────────────────── S17 Foodics (independent)
```

Two edges are worth naming. **S7 must precede S8**: the costing screen is meaningless without a way to enter real material costs and recipes, and PRD R5 makes real costs an M3 gate. **S12 must precede S13**: the GA gate is onboarding cafés #2 and #3 with zero code changes, which is not testable without provisioning that does not involve me and a database client.

Two of these edges are about *data*, not code: the Habit Engine's targeting rules are meaningless without weeks of order history (PRD §11 makes the same point), and demand forecasting needs enough history to have a weekly profile at all. Building them earlier produces features that cannot be evaluated.

---

## 4. The cut list, in order

Decided now, while calm, so week 15 does not have to decide it at 2am:

1. Upsell + cross-sell (FR-2.12, 2.13)
2. Simulate +10% (FR-5.15), margin sparklines (FR-5.16)
3. Off-Peak Pricing and Ramadan Scheduling (FR-5.19, 5.20) — Forecasting and Menu Engineering carry the pitch
4. Console charting — tables ship, charts follow
5. LLM digest narrative (FR-5.6) — the table alone is correct and useful
6. **CSV import and the recipe library** (FR-10.17, FR-10.18) — they make onboarding fast, not possible; manual entry works for cafés #2 and #3
7. **Platform Admin billing/usage views and the compliance queue** (FR-11.17, 11.18) — invoicing is manual anyway at this tenant count; entitlements, flags, rails control, and support tooling are not cuttable
8. Foodics integration (S17) — the entire Has-POS track slips before anything on the no-POS track, per the PRD's own thesis

**Never cut**: the material ledger and its invariants, void attribution, offline Till, Arabic/RTL, payment webhook idempotency, backups with a *tested* restore, R1 containment controls, the placeholder-cost gate, **the settings registry and three-layer resolver**, and **the impersonation safeguards**. Each is either impossible to retrofit without a migration, or the thing that makes the product trustworthy at all — and the last one is the difference between a support tool and a liability.

---

## 5. Weekly rhythm

| When | What |
|---|---|
| Mon AM | Sprint check: exit criterion still reachable? If not, cut now, not later |
| Daily | One deploy to staging minimum. Green main is a hard rule |
| Wed | **Ops block, 2 hours**: tickets, error budget, invariant reports, dependency updates, one runbook rehearsed |
| Fri PM | Demo to myself against the exit criterion. Write down what actually shipped versus what was planned — the delta is the velocity calibration for the next sprint |
| Sprint end | Retro of one page: what surprised me, what I would sequence differently, what goes on the cut list |
| Monthly | Backup restore drill (automated, but I read the result), cost review, security patch sweep |

The Wednesday ops block is the single most important line in this table. Solo projects do not fail from lack of features; they fail when operational debt compounds until every hour goes to firefighting.

---

## 6. Schedule risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| ~~Paymob integration overruns S2~~ | **Closed** | No payment provider in v1 (ADR-0010). This was the highest-likelihood schedule risk in the plan and it no longer exists |
| **No-show abuse turns out worse than expected** at the pilot — wasted materials from uncollected orders | Medium | The accept gate caps exposure to what a barista consciously accepted; abandon rate and waste value are reported daily so the thresholds can be tuned in week one rather than debated in advance |
| Meta template review is slow or reclassifies the digest (R6) | Medium | Submitted S6, needed S7 — four sprints of buffer |
| WhatsApp in-app browser breaks the webview in ways Chrome does not (NFR-45) | **High** | Tested in the in-app browser from S1, not at the end |
| Real supplier prices (Q2) arrive late | Medium | Costing UI ships regardless; the placeholder rule means it degrades honestly rather than lying |
| whatsapp-web.js breaks against a WhatsApp Web update | **High, ongoing** | Pinned version, health probe, freeze-not-reconnect, and the pre-approved Cloud API fallback (FR-7.11). This is a *when*, not an *if* |
| Pilot café changes their mind about the R1/R2 disclosure (Q6) | Medium | The compliant Review Shield variant is already built; flipping it is a config change |
| I get sick / life happens | **Certain, at some point** | 15% per-sprint slack, an explicit cut list, and no milestone that depends on a heroic sprint |
| **Configuration surface sprawls** — S7 grows as every "just one more toggle" arrives | Medium | The `setting_definitions` registry is an allowlist requiring a one-sentence description in both languages. If it cannot be described to a café owner in one sentence, it does not get a row (ADR-0015) |
| **Store Console CRUD is under-estimated** — versioned edit UX is genuinely fiddly | Medium | S7 ships menu, materials, recipes, and settings; CSV import and the recipe library are already on the cut list as the release valve |

---

## 7. Schedule impact of the console scope

| Milestone | Original | Revised | Delta |
|---|---|---|---|
| M1 — Ordering loop | Week 8 | Week 8 | — |
| M2 — Counter complete | Week 12 | Week 12 | — |
| M3 — Pilot-ready | Week 16 | **Week 18** | +2 |
| M4 — Retention live | Week 20 | **Week 22** | +2 |
| M5 — GA | Week 24 | **Week 28** | +4 |
| M6 — AI + Has-POS | Week 32 | **Week 36** | +4 |

Two sprints added: S7 (Store Console CRUD) and S12 (Platform Admin), plus about three days folded into S6 for the admin thin slice.

### 7a. What removing payments gives back

Dropping the PSP (ADR-0010) removes intention creation, hosted checkout, HMAC callback verification and its contract tests, webhook idempotency, the reconciliation job, the `pending_payment`/`expired` states, INV-6 as a double-capture check, RB-2, PCI scope, and merchant onboarding as a schedule dependency. Against that, it adds the kitchen-accept gate and the no-show controls — about four days.

**Net: roughly two-thirds of a sprint, most of it in S2.**

I am **not** moving the milestone dates for it, deliberately. That saving lands almost entirely before M1, where the plan was tightest, and the honest use of it is slack rather than a promise. If S2 and S3 land clean, M5 and M6 can pull in by one sprint — a decision to make at the S3 retro with real velocity data, not now with an estimate. Third-party payment integration is exactly where solo estimates blow up; banking the saving as buffer is worth more than banking it as a date.

What genuinely improves regardless of dates: **the riskiest external dependency in the plan is gone**, the ordering path now depends on nothing but Meta and our own database, and marginal cost per order drops to about zero (NFR-48).

**The trade, stated plainly.** The pilot slips two weeks. In exchange, the pilot café can change its own prices, add a seasonal item, and fix a recipe without messaging me — and GA becomes a thing that can actually happen, because "onboard café #2 with zero code changes" stops being a gate I would have to fail or fake. Both of those cost far more than two weeks once they are load-bearing: a pilot where every menu change is a support ticket teaches the owner the product is fragile, and a fleet operated by SQL does not survive past three cafés.

The alternative sequencing — ship the pilot at week 16 and add the consoles after — was considered and rejected. It front-loads two weeks of schedule at the cost of putting me inside every menu change during the exact period when the pilot is meant to prove the café can run on this alone.
