# Veyrox Food — Master Plan

**From PRD v1.0 to production-ready software.**
Owner: Product Engineer (solo) · Baseline: 2026-09-05 · Pilot live: 2027-01 · GA (no-POS track): 2027-04

---

## 1. What this plan optimizes for

The PRD describes a system whose hard part is **not scale**. Peak load is one café doing ~300 orders/day, ~40 orders in the busiest hour. A single Postgres instance and one API container handle 50 cafés without breaking a sweat. Anyone who plans this project around sharding, CQRS, or Kubernetes has misread the problem.

The hard parts are:

1. **Correctness of money and materials.** The void/return mechanism (§8.4, G4) has an acceptance criterion of *exact* equality with no manual reconciliation. Recipe costing (§8.5.3) feeds real pricing decisions by a real owner. If these are subtly wrong, the product is worse than the paper tickets it replaces, and the owner will never trust it again.
2. **Reliability during a 20-minute morning rush, on café wifi, on cheap tablets.** The KDS going blank at 08:40 is an existential product failure. Degradation must be designed, not discovered.
3. **Two deliberately fragile external dependencies** — an unofficial WhatsApp automation that can be banned without appeal (R1), and a review flow that is likely non-compliant (R2) — that must be contained so neither can take the core product down with it.
4. **Being operable by one person.** Every choice below is filtered through: *can one engineer debug this at 08:30 from a café, on a phone, while the owner watches?*
5. **Being configurable without me.** A café that cannot change its own price, add a seasonal item, or fix a recipe without messaging me is not a product, and a fleet I operate with SQL does not survive past three cafés. Both consoles (`13-admin-and-configuration.md`) exist for this, and one of them is a pilot blocker.

Four engineering theses follow:

> **T1 — Single write path.** Every mutation goes through one API that owns the invariants. No client writes directly to the database, ever. This is what makes the ledger provably correct.
>
> **T2 — Immutable history, derived views.** Prices, costs, recipes and material movements are append-only and versioned. Reports are computed from history, never mutated in place. This is what makes yesterday's margin report still true tomorrow.
>
> **T3 — Boring, managed, few moving parts.** Six deployables, one database, one queue. Anything that adds a system I must operate has to earn it against a solo on-call budget.
>
> **T4 — One configuration model, two consoles.** Every behaviour resolves through platform capability → tenant entitlement → tenant preference, in that order, from one registry. This is what makes a kill switch un-overridable, an entitlement un-bypassable, and "why is this off?" answerable. [ADR-0015]

---

## 2. Strategy and sequencing

### 2.1 The bet, restated in engineering terms

The PRD's business bet is: *win the no-POS segment by being the system of record, then upsell the AI layer; sell the AI layer alone to Foodics accounts later.* That maps to one sequencing rule:

**Build the system of record before building anything that reads from it.** Analytics, costing, habit rules, and every AI add-on are functions of a correct order and material history. Building them earlier means building them twice.

The phase order therefore matches PRD §11 with one change: **Recipe Costing moves earlier than Phase 3 implies**, because the *material ledger* it depends on is built alongside the Till in Phase 2 regardless. Costing is then a thin read layer, not a new phase of infrastructure. This pulls the highest-retention feature (G2) forward by roughly a month at near-zero cost.

### 2.2 Milestones

| ID | Milestone | Definition of done | Target |
|---|---|---|---|
| **M0** | Walking skeleton | A real WhatsApp message hits the deployed API, creates a row, and a ticket appears on a deployed KDS in under 1s. CI/CD, staging, observability, and rollback all working. | Week 2 |
| **M1** | Ordering loop closed | Someone who is not me orders a real drink from the store QR, a barista accepts it, and they are told when it is ready and what to pay at the counter. | Week 8 |
| **M2** | Counter complete | Till, offline outbox, atomic void with exact material return, EOD report. Ledger invariant monitor green for 7 consecutive days. | Week 12 |
| **M3** | Pilot-ready | Store Console (analytics, costing, **and full menu/recipe/settings CRUD**), digest, Review Shield, admin thin slice. Runbooks rehearsed. Staff trained. Brew & Baladi runs limited hours on the real system — **and changes its own menu without me**. | Week 18 |
| **M4** | Retention live | Habit Engine on isolated infrastructure with kill switch, rate limits, opt-out, and an approved Cloud API fallback sitting ready. | Week 22 |
| **M5** | GA, no-POS track | Platform Admin complete. Security review passed, load tested at 10x pilot peak, game day survived, second and third café **provisioned from the Admin console** with zero code changes. | Week 28 |
| **M6** | Monetized layer + Has-POS | Four AI add-ons behind entitlement flags; Foodics read integration with the data-scope banner enforced. | Week 36 |

Weeks count from Sprint 0. Sprint-by-sprint detail and the explicit cut list: `06-sprint-plan.md`.

### 2.3 Success, mapped to the PRD's goals

G1–G5 are product metrics. Each needs an instrumented counterpart that exists in the software on day one, or it cannot be measured at pilot time. This is a build requirement, not an analytics afterthought:

| PRD goal | Target | What must exist in the code | Where |
|---|---|---|---|
| G1 — ≥95% of orders captured digitally | 95% | A `footfall_estimate` the owner enters at Till close-out, so the *denominator* exists at all. Without it, G1 is unmeasurable. | FR-4.7 |
| G2 — Recipe Costing opened ≥3x/week | 3x | Product-analytics event `console.tab_viewed{tab}` with a real session model, not page hits. | FR-5.9 |
| G3 — Win-back → order ≥8% | 8% | Discount codes single-use, attributed to the sending `habit_run_id`, redemption joined back to the order. | FR-7.6 |
| G4 — 100% of voids reconciled | 100% | The ledger invariant as a continuously-running assertion with an alert, not a report someone reads. | FR-4.5, NFR-11 |
| G5 — ≥40% Habit Engine reply rate | 40% | Inbound replies on the habit rail correlated to the outbound send within 24h. | FR-7.7 |

**A goal without instrumentation designed in before the feature ships is a goal that gets retrofitted with bad data.** Each of the above is a line item in the sprint that builds the feature it measures.

---

## 3. Technology stack

Full rationale per decision in `adr/`. Summary and the one-line reason:

| Layer | Choice | Why (short) |
|---|---|---|
| Language | TypeScript 5.x, Node 22 LTS, strict | One language across API, five frontends, jobs, and shared domain logic. For a solo dev, context-switch cost dominates raw runtime merit. [ADR-0001] |
| Monorepo | pnpm workspaces + Turborepo | The shared domain package is the whole point: it must be impossible for the Till and the analytics job to disagree about what a recipe costs. [ADR-0001] |
| API | Fastify + Zod (`fastify-type-provider-zod`) | Schema-first: one Zod schema yields runtime validation, TS types, and the OpenAPI doc. Express gives none of that. [ADR-0001] |
| Database | Postgres 16 on **Neon** | Plain Postgres, no BaaS. Scale-to-zero, **branching for per-PR preview environments**, cheaper at scale, and every exit stays `pg_dump`. Supabase was dropped once its bundle was measured honestly: one auth realm and a realtime layer we had already downgraded. [ADR-0002] |
| Auth | **Custom**, all four realms in `code/backend/api` | We were already building three of the four ourselves — customer token, staff device+PIN, admin WebAuthn. Buying a vendor for the fourth was not worth the lock-in. [ADR-0002] |
| Schema/migrations | Drizzle ORM + drizzle-kit | SQL-shaped, no query-engine binary, migrations are reviewable SQL in git. Analytics stays hand-written SQL. [ADR-0002] |
| Live updates | **SSE server push** from our own API, replay on reconnect. **No polling.** | `order_events` is already an append-only sequenced log, so replay is `WHERE id > lastSeen` against a table we build anyway. `EventSource` gives auto-reconnect and `Last-Event-ID` free. [ADR-0005] |
| Jobs & scheduling | **BullMQ on Redis** — n8n dropped | A GUI-configured workflow tool has no code review, no tests, no rollback, and no local reproduction. Unacceptable for a system that sends money-affecting messages. [ADR-0004] |
| Frontends | Vite + React 19 SPAs (×4), Cloudflare Pages | All four surfaces are auth- or token-gated: SSR buys zero SEO and costs a server runtime. Dropping Next.js removes a whole hosting dependency. [ADR-0009] |
| Platform Admin | Separate deployable, separate auth realm, **mandatory WebAuthn** | It reads every café's books and can disable every safety control. A compromise there is a fleet incident, not a tenant one. [ADR-0014] |
| Configuration | `setting_definitions` registry + three-layer resolver in `packages/domain` | One answer to "is this on, and why." Kill switches that an owner cannot override. Bounds enforced once, not in two UIs. [ADR-0015] |
| Offline | IndexedDB outbox + idempotency keys + service worker | Café wifi drops. The Till must keep working. [ADR-0006] |
| Payments | **None in v1.** Cash on pickup, plus the café's own terminal recorded as a `visa` label | Removes the riskiest third-party integration, PCI scope entirely, the in-app-browser redirect, and merchant onboarding as a schedule dependency. Adds a kitchen-accept gate to carry the no-show risk that prepayment used to. [ADR-0010] |
| Official messaging | WhatsApp Cloud API, CTA-URL webview | Flows evaluated and deferred to v2; full control over the cart UI and one codebase for the whole journey. [ADR-0003] |
| Habit rail | whatsapp-web.js on an **isolated Hetzner VPS**, separate everything | Per PRD §6.1 and R1-mitigation. Blast-radius design in `10-risk-containment.md`. [ADR-0003] |
| Hosting (API/workers) | Fly.io, region `fra` | ~60–80ms Cairo RTT, Docker-native, persistent volumes, cheap HA pair. [ADR-0011] |
| Observability | OpenTelemetry → Grafana Cloud (Tempo/Loki/Prometheus) + Sentry | Three signals, one place, free tier covers 50 cafés. [ADR-0012] |
| AI add-ons | Deterministic statistics for the numbers; Claude API (`claude-sonnet-5`) for *phrasing only* | An LLM must never do the arithmetic an owner prices against. See §5.3. [ADR-0013] |

**Deliberately not used:** Kubernetes (four containers), Kafka (300 events/day), a data warehouse (a Postgres read replica is already 100x oversized), microservices (one deployable boundary per team; there is one engineer), GraphQL (three known clients), LaunchDarkly (a `flags` table costs nothing), n8n (above).

---

## 4. Architecture on one page

```
                        ┌──────────────── ISOLATION BOUNDARY ──────────────┐
 Customer phone         │                                                  │
  (WhatsApp) ──┬─► Meta Cloud API ──► webhook ─┐   Habit worker (Hetzner)  │
               │                               │     whatsapp-web.js       │
  store QR ───┘                               │     Chromium + volume     │
                                               ▼            │              │
   Order Webview (SPA) ──────────────► ┌───────────────┐    │ reads ONLY   │
                                       │               │    │ vw_habit_    │
   Ops SPA (KDS + Till, offline) ─────►│  Fastify API  │◄───┘ targets      │
                                       │  single write │      (4 columns)  │
   Store Console SPA ─────────────────►│     path      │                   │
   Platform Admin SPA (WebAuthn) ─────►│  /admin/*     │  └────────────────┘
                                       └───────┬───────┘
   (no payment provider — ADR-0010)             │
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                     Postgres (Neon)       Redis + BullMQ   R2 storage
                      - append-only          - digest 22:00   - receipts
                        material_ledger      - review T+30m   - exports
                      - versioned recipes    - habit crons
                      - price snapshots      - reconciliation
                              │
                              └─► SSE stream from api (replay on reconnect) ─► Ops SPA
```

Three properties carry most of the design weight:

1. **The API is the only writer, and now the only reader too.** No client ever connects to Postgres. The webview, the tablets, and the workers all mutate through one validated, audited, idempotent surface, and the live stream is pushed from the same place. That is what makes "a voided order's ledger rows sum to zero" enforceable rather than aspirational — and it is why dropping the BaaS cost us so little.
2. **The habit rail crosses the boundary in exactly one direction, through one narrow view.** The whatsapp-web.js worker cannot read the customer table, cannot write anything, and holds no credential that touches the ordering rail. A ban, a compromise, or a rogue Chromium process costs us that VPS and nothing else.
3. **Every scheduled thing is a BullMQ job with a Cairo-timezone repeat rule**, so there is exactly one place to look when "the 22:00 digest went out at 21:00 in November."

Full detail: `01-system-design.md`.

---

## 5. The parts that need real design, not just implementation

### 5.1 The material ledger — the most important design in this system

PRD §8.4 requires that voiding an order returns *exactly* the materials it deducted. The naive implementation — recompute the recipe and add it back — is wrong in a way that only surfaces weeks later:

> The owner edits the Latte recipe at 14:00 (less milk). An order sent to the kitchen at 13:50 is voided at 14:10. Recomputing returns *the new, smaller* milk quantity. The books now permanently show milk that was never consumed and never returned. The error is small, silent, cumulative, and it destroys G4 — and with it the owner's trust in every number on the dashboard.

**The design:** materials move only through an append-only `material_ledger`. Kitchen Accept writes negative rows stamped with the `recipe_version_id` in force at that instant; sending to kitchen only creates a pending ticket. Voiding writes the **exact negation of those specific rows** — it never consults a recipe. Correctness becomes an assertion:

```sql
-- Invariant INV-1, checked continuously; any row is an alert
SELECT order_id, material_id FROM material_ledger
WHERE order_id IN (SELECT id FROM orders WHERE status = 'voided')
GROUP BY order_id, material_id
HAVING sum(qty_delta) <> 0;
```

The same principle governs money: `order_items` snapshot `unit_price_minor` and `cost_snapshot_minor` at order time, so updating an ingredient price today cannot silently rewrite last month's margin report. Recipes are versioned; prices are versioned; nothing a report has already read is ever updated in place.

This is T2, and it is the difference between a demo and a system of record.

### 5.2 The ETA — a promise, not a calculation

PRD §8.2 wants a dynamic ETA and §8.3 wants queue depth feeding it live. The naive version divides items by baristas, is wrong within a day, and customers stop believing it — at which point the feature is worse than nothing.

Three stages:
- **v1 (S3):** `eta = prep(cart) + queue_wait`, where `prep(cart) = max(item_prep) + 0.4 × Σ(other items)` (parallelism factor, configurable) and `queue_wait = (Σ remaining prep across Received + Preparing) / active_stations`. Shown to the customer as a **range** (`"8–12 min"`), never a point estimate. Under-promising is a product decision, not a hedge.
- **v2 (S8, after two weeks of pilot data):** static per-item prep times are replaced nightly by observed p50 of `ready_at − accepted_at`, bucketed by item and hour-of-day.
- **Continuous:** ETA accuracy is an SLI. `p90(actual − promised_upper)` is on the dashboard, alerting if the promise is missed *or beaten* by more than 5 minutes at p90. A quietly-degrading ETA is invisible without this.

### 5.3 The AI add-ons — deterministic maths, LLM phrasing only

All four §8.5.4 add-ons are, correctly specified, statistics problems rather than LLM problems:

| Add-on | Actual technique | Not |
|---|---|---|
| Demand Forecasting & Waste | Per-item day-of-week × hour-of-day profile, EWMA level, plus an explicit Egyptian holiday/Ramadan calendar overlay. Reports a prediction interval; orders to the upper bound for perishables, the point estimate for staples. | An LLM guessing quantities |
| Menu Engineering | Deterministic quadrant classification on (margin %, unit volume) against the period median. Pure arithmetic, fully explainable to the owner. | ML of any kind |
| Off-Peak Pricing | Rules plus guardrails: discount only, capped depth, capped hours, never below `cost × 1.15`, one-directional per PRD §4 (permanent). | Elasticity modelling on six weeks of data |
| Ramadan Labor Scheduling | Constraint satisfaction over the iftar demand curve with staff availability and rest constraints. Greedy plus local search suffices at this size. | An LLM writing a rota |

The LLM (`claude-sonnet-5`, structured output) does exactly one job: **turning a computed table into two sentences of prose in the owner's chosen language** for the digest and the purchase list. Numbers are computed in TypeScript, passed in, and the model is instructed to restate and never derive. Every generated string is stored next to the deterministic payload that produced it, so any owner complaint is reconstructible.

Rationale: an owner will make a purchasing decision from this text. A hallucinated quantity is a real loss to a real small business. The blast radius of a bad sentence is a bad sentence; the blast radius of a bad number is the owner's month.

### 5.4 Offline behaviour, because the wifi will drop

The Till and KDS run on tablets on café wifi during the twenty minutes that matter most.

- Every staff action is written to an **IndexedDB outbox** with a client-generated UUIDv7 idempotency key, applied optimistically to local state, and flushed by a background sync loop.
- The server dedupes on `(tenant_id, idempotency_key)` via a unique index; a replayed request returns the original response, not an error.
- The order state machine is **idempotent on re-entry**: advancing an already-`ready` ticket returns `ready` with 200, not 409. Baristas double-tap; that is the normal case, not a defect to guard against.
- Hard rule: **payment state is never optimistic.** A Till order can be created and sent to kitchen offline; it cannot be marked Paid until the server confirms. The UI shows a distinct "pending sync" state and the EOD report refuses to close with unsynced items.
- The KDS shows a persistent, unmissable connection banner carrying the age of its last update. Staff must never look at a stale board and believe it is live.

### 5.5 The two consoles — and why one of them is a pilot blocker

Full spec: `13-admin-and-configuration.md`. The two decisions that matter at this altitude:

**The Store Console is not "analytics plus some forms."** Almost nothing in it is plain CRUD, because prices, recipes, and costs are versioned so historical reports stay true (§5.1). "Edit price" closes one version and opens another; "delete item" archives rather than deletes, because six months of order lines reference it. The owner never sees the word *version* — they see the consequence: *"New price applies to new orders. Past orders and reports keep the old price."* Menu edits stage in a draft and publish atomically as one new menu version, so a customer's cart can never be priced against a half-edited menu at 08:30.

That last point about the recipe editor is worth calling out as product, not plumbing: when an owner changes a recipe, the system tells them *"orders already in the kitchen will still return their original quantities if voided."* That sentence is the ledger design made visible, and it is the single best moment in the product to earn the owner's belief in every other number on the dashboard.

**Part of this is a pilot blocker, and that was previously hidden.** The original plan seeded the pilot menu with a script. That works for one café and makes the M5 gate — "second and third café onboarded with zero code changes" — unreachable. Menu, recipe, material, and settings CRUD is what makes the pilot *repeatable*, so it moves ahead of Recipe Costing in the sprint order.

**The Platform Admin is the highest-privilege surface in the system**, and gets treated accordingly: its own deployable, its own auth realm with a mandatory hardware key, platform roles from day one, no UI path to tenant deletion, and a CLI equivalent for every action — because the console is the mechanism for flipping `safe_mode`, and a kill switch reachable only through a web app has failed the moment the incident is a bad deploy [ADR-0014].

**Everything resolves through three layers**: platform capability → tenant entitlement → tenant preference. That ordering is what makes RB-9 executable (a Google policy action stops review gating fleet-wide in one action, and no owner can turn it back on), and what makes an unpaid add-on unreachable rather than merely hidden. Clients receive *resolved state* with a reason, never raw flags [ADR-0015].

**What owners deliberately cannot configure**: review gating, the habit rail channel, void authorization, retention floors, and anything in the correctness machinery. The rule is that owners configure what the product does, not what makes it trustworthy — and where a control is genuinely both (loyalty rates, ETA factors, send frequency) they get a bounded range rather than a free field.

### 5.6 Fraud and attribution — the gap the PRD leaves open

Voids are the classic F&B theft vector: staff takes cash, voids the order, keeps the difference. The PRD specifies voids as a workflow with no actor, no authorization, and no anomaly detection — which would ship a product that makes theft *easier* than paper. Treated as a P0 correction (GAP-06):

- Device enrollment (once per tablet) plus a **per-staff PIN** for attributable actions.
- Voids require a **manager PIN** and a reason code; both recorded immutably.
- The EOD report breaks voids down by staff member; a nightly job alerts the owner on outliers (staff void rate > 2σ above branch mean, or any void of an already-paid order).

---

## 6. Requirements coverage

`02-functional-requirements.md` decomposes every PRD §8 feature into numbered, testable requirements with acceptance criteria, priorities, and traceability to PRD sections and user stories. `03-non-functional-requirements.md` does the same for availability, latency, durability, security, privacy, accessibility, localization, and cost — each with a measurable SLI and the alert that watches it.

**Every P0 in the PRD is preserved.** Nothing is dropped or downgraded. Four things are *added* at P0 because the product is not shippable without them; each is argued individually in `11-prd-gap-analysis.md`:

| Added P0 | Why it cannot wait |
|---|---|
| **Arabic (RTL) localization** | The pilot is in Cairo. A large share of customers will not order in English. The PRD does not mention language once. Retrofitting RTL into five SPAs costs 3–4x. |
| **Item availability / "86-ing"** | Cafés run out of oat milk daily. Without it, the bot sells what the kitchen cannot make, and every such order becomes a void, a refund, and an angry customer. |
| **Void authorization & attribution** | §5.6 above. |
| **Store hours / closed-state handling** | QR codes are physical and permanent. People will scan them at 02:00. The bot must respond correctly rather than take an order nobody will make. |

Two more are added at P1 for the same reason at lower urgency: refunds for *paid* orders (the PRD only specifies voiding *unpaid* ones) and loyalty point clawback on void or refund.

**A fifth P0 was added when payments were removed** (ADR-0010): the **kitchen-accept gate** plus its no-show controls. Prepayment used to mean a customer who never showed cost the café nothing. Without it, anyone with WhatsApp can make a café consume milk and barista time with no commitment — so a barista taps Accept before anything is deducted or made, a customer may hold only one open unpaid order, and an unclaimed drink is recorded as **waste, not a return**, because the milk is genuinely gone.

---

## 7. Quality, launch, and operations

### 7.1 The testing pyramid, weighted for this product

Solo teams cannot afford broad, slow suites, and cannot afford production correctness bugs in money. The weighting follows:

- **`@veyroxai/domain` is a pure, dependency-free package** holding pricing, modifier resolution, ETA, loyalty tiering, recipe costing, and ledger arithmetic. It carries a **90% line / 100% branch** gate and **property-based tests** (fast-check) for the ledger invariant: *for any random sequence of orders, recipe edits, and voids, every voided order sums to zero per material.* This is the highest-value test asset in the project.
- **Integration tests** run against real Postgres (Docker Compose in CI): state machine, idempotency replay, RLS enforcement, transactional void.
- **Contract tests** replay recorded Meta webhook fixtures, including the malformed, duplicated, and out-of-order cases that actually occur.
- **E2E (Playwright)** covers exactly five journeys — order, prepare, ring up, void, close out — on merge to main, not per commit.
- **Load (k6)** proves 10x pilot peak before M5. A formality at this scale; it exists to catch pathological N+1s, not capacity limits.
- **Game days** before M5: kill the WhatsApp session, sever the SSE stream mid-rush, cut the Till internet, break the Admin console. Each has a runbook; each must degrade gracefully.
- **The café day simulation**: before the pilot's first real day, a scripted 50-order rush on the actual tablets, on the café's actual wifi, with the actual staff. Every solo-built product that skips this finds its worst bug in front of a paying customer.

Merge gates and detail: `07-test-and-quality-strategy.md`.

### 7.2 Launch gates

No milestone ships without its gate. Non-negotiable and self-enforced:

- **M1** — the ordering loop works for a stranger with me out of the room; payment-webhook idempotency proven by replay.
- **M2** — INV-1 green for 7 consecutive days on staging under synthetic traffic; the offline outbox survives a 10-minute partition with zero lost or duplicated orders.
- **M3 (pilot)** — runbooks written and rehearsed; owner and staff trained; rollback tested; a signed pilot agreement disclosing R1 and R2 in plain language; **no placeholder ingredient costs anywhere in the system** (PRD R5 — a margin number computed from a made-up cost is worse than no margin number).
- **M4 (Habit Engine)** — kill switch verified end to end; opt-out honoured by *both* rails; Cloud API fallback templates **submitted to and approved by Meta and sitting unused**; per-customer weekly cap proven by test.
- **M5 (GA)** — security review complete; PDPL data-subject-request flow working; second café onboarded with zero code changes; error budget intact for 30 days.

### 7.3 Operating as one person

On-call is me, permanently. That makes operational design a feature, not overhead:

- **Two alert tiers only.** *Page* (wakes me): ordering path down, payments failing, ledger invariant violated, data-loss risk. *Ticket* (waits for the ops hour): everything else. An alert that is neither gets deleted. Alert fatigue for a solo operator is a future total outage.
- **Feature flags on every risky surface** (`habit_engine`, `review_gating`, `ai_addons.*`, `whatsapp_ordering`, per-tenant), DB-backed, flippable in under 60 seconds from a phone.
- **Safe mode**: one flag reducing the product to "take orders, show tickets, record payments" and disabling everything else. This is the answer to most incidents at 08:30.
- **A weekly two-hour ops block**: tickets, error budget, invariant reports, dependency updates. **Monthly automated restore drill** — a backup that has never been restored is not a backup.

Runbooks for the eight most likely incidents: `08-operations-runbooks.md`.

---

## 8. Risk posture

The two accepted risks ship as decided. My job is not to reopen them but to ensure neither can take anything else down, and that reversing either is a config change rather than a project. Detail in `10-risk-containment.md`; the shape:

**R1 — whatsapp-web.js.** Contained by *physical* isolation (separate host, number, credentials, egress), a *narrow* data interface (one read-only view, four columns), *conservative* send behaviour (rate caps, jitter, per-customer weekly cap, global daily cap, opt-out honoured across both rails), *fast detection* (session health probe every 5 minutes; freeze on auth failure rather than reconnect-storm, since retry loops raise ban probability), and a *pre-built escape hatch* — a `HabitChannel` interface with a second, fully implemented Cloud API implementation whose templates are Meta-approved before the Habit Engine ever launches. When the ban comes, migration is a flag flip and a cost increase, not an outage and a rewrite.

**R2 — review gating.** The gated flow ships as specced, wrapped in a per-tenant flag; every rating and every link-shown decision is logged immutably so the behaviour is auditable and reconstructible; the compliant variant (ask everyone for a public review, route only the *private alert* conditionally) is built behind the same flag so switching is config; and one hard constraint is added — **the recovery voucher is never mentioned in the same message as a public-review ask**, because incentivized reviews are a materially worse violation than gating and would compound the exposure. The pilot agreement discloses the Business Profile suspension risk to the owner, because it is their profile at stake, not mine.

**R5 — placeholder costs** is promoted from "Open, Low" to an **M3 launch gate**. Shipping a margin dashboard computed from illustrative prices is the fastest way to lose the owner permanently.

**R6 — template classification.** The Nightly Digest template is submitted to Meta in Sprint 6, four sprints before it is needed, so a Marketing reclassification becomes a pricing surprise in September rather than a launch blocker in December.

---

## 9. Team and cost

Solo build. Full treatment in `12-team-and-operating-model.md`; the summary:

**I do myself:** architecture, backend, frontend, data, infrastructure, release engineering.

**I contract, because doing it badly is worse than paying for it:**

| Need | Why not me | Shape |
|---|---|---|
| Egyptian-Arabic UX copy + RTL review | I will write stilted, formal Arabic. Customers will read it as a robot. | Freelance copywriter, ~2 weeks part-time before M1, again before M4 |
| Legal review — PDPL, WhatsApp ToS exposure, pilot agreement | R1 and R2 are accepted business risks; they still need papering. | Egyptian tech/commercial lawyer, one engagement pre-M3 |
| Visual design system | I can build competent UI; I cannot build a brand. | Designer, 3 weeks, front-loaded before S1 so the token set exists early |
| Accessibility + security audit | Independent eyes, pre-GA. | One engagement each before M5 |

**Hiring order as revenue allows:** (1) full-stack engineer — buys back on-call and doubles delivery; (2) customer success / onboarding — the real constraint from café #5 to #50 is training, not software; (3) data engineer — when the AI add-ons become the revenue line.

**Infrastructure is phased** (ADR-0011), because there is no revenue and no café yet:

| Phase | When | Shape | Cost |
|---|---|---|---|
| **0** | now → M2 | Neon free + one Hetzner CX22 (api/worker/Redis) + Cloudflare Pages & R2 + free observability | **~$4/mo** |
| **1** | M3, first real café | Neon paid (**PITR** — hard gate), Fly.io `fra` ×2, managed Redis | ~$30–40/mo |
| **2** | M5, GA | Fly HA pair, managed everything | ~$80–150/mo |

Phase 0 knowingly misses NFR-1, NFR-20 and NFR-21 — no HA, no 5-minute RPO. That is acceptable **only** while there are no users, and **restoring it is written into the M3 gate** rather than left to judgement. The habit rail always gets its own separate box (~€4/mo from S10); that is R1 containment, never a cost decision.

With no payment provider, the only meaningful marginal cost is WhatsApp template messages — free inside the 24h window — so **marginal cost per order is effectively zero** (NFR-48). A real advantage when selling to thin-margin informal operators.

---

## 10. What I cut, in order, if I fall behind

Stated in advance so the decision is made calmly rather than at 2am in week 15:

1. **P1 upsell and cross-sell** (§8.2) — revenue optimization on a product with no volume yet.
2. **"Simulate +10% ingredient"** (§8.5.3 P1) — a demo feature, not an operating one.
3. **AI add-ons 3 and 4** (Off-Peak Pricing, Ramadan Scheduling) — slip past GA; Forecasting and Menu Engineering carry the pitch.
4. **Store Console charting polish** — tables ship, charts follow.
5. **Platform Admin's non-operational surfaces** — billing/usage views and the compliance queue can wait; entitlements, flags, rails control, and support tooling cannot.
6. **CSV import and the recipe library** — they make onboarding fast, not possible. Manual entry works for cafés #2 and #3.
7. **Foodics read integration** — the entire Has-POS track slips before anything on the no-POS track does, because the PRD's own thesis says the no-POS pilot must be proven first.

**Never cut:** the material ledger and its invariant, void attribution, offline Till behaviour, Arabic localization, payment-webhook idempotency, backups with a tested restore, the R1 containment controls, the settings registry and three-layer resolver, and the impersonation safeguards. These cannot be added later without a migration and a trust rebuild — and in the last two cases, without a security incident first.

---

## 11. Open questions blocking specific sprints

| # | Question | Blocks | Needed by |
|---|---|---|---|
| ~~Q1~~ | **Closed.** Paymob merchant status is no longer a dependency — v1 has no payment provider (ADR-0010). This was the highest-likelihood schedule risk in the plan. | — | — |
| ~~Q5~~ | **Closed 2026-09-05 — English-primary, Arabic secondary.** `default_locale = 'en'`; `name_en` required, `name_ar` optional with fallback. **RTL stays P0** because Arabic is still offered. Cuts against GAP-01's recommendation; recorded there with the residual risk. | — | — |
| ~~Q7~~ | **Closed — default off.** `ordering.ask_table_number` ships off; counter pickup is the v1 story. Owner-flippable from the Store Console with no code change. | — | — |
| ~~Q8~~ | **Closed — defaults stand**: abandon after 30 min in `ready`; no-show step-down at 3 abandonments / 90 days. Both bounded owner settings, tunable in pilot week one against real abandon data. | — | — |
| ~~Q2~~ | **Closed 2026-09-06 — each café enters its own supplier prices.** Already the design: `material_costs` is per-tenant, owner-editable, and versioned (FR-5.10). No architecture change. The M3 gate is unchanged in substance — it is now "the *pilot café* has entered real costs", enforced by the `source='placeholder'` rendering rule (FR-5.14) rather than by me sourcing a price list. | — | — |
| ~~Q3~~ | **Closed 2026-09-06 — e-invoicing is v2.** The tax registration number is a per-café setting the owner enters (`tenants.tax_registration_number`), not a platform decision. **No Tax Authority submission in v1.** Receipt records still carry the e-invoicing fields from day one (FR-9.8), so v2 is an integration rather than a re-model — backfilling them onto historical receipts later is the expensive version. | — | — |

> **Naming note.** "ETA" was doing two jobs in these documents: the customer's *estimated time of arrival* (FR-2.19) and the *Egyptian Tax Authority* e-invoicing regime. They are now separated — **ETA means only the order estimate**, and the tax regime is called **e-invoicing** throughout. Two things sharing an acronym in a specification is how a requirement gets built as the wrong feature.
| ~~Q4~~ | **Closed 2026-09-06 — the habit number belongs to the café, as a second, separate line.** Better product (messages come from a number the customer recognises, which should help G5) and it keeps the ban confined to a number the café can replace. **Two consequences, now tracked**: (a) one whatsapp-web.js session *per café*, which does not scale linearly — see NR-9; (b) the ban risk lands on the café's asset, so the R1 disclosure in the pilot agreement is no longer courtesy, it is required. | — | Confirmed |
| ~~Q6~~ | **Closed 2026-09-06 — accepted.** Cafés take written disclosure of R1 and R2. The gated Review Shield ships as the PRD specifies; the compliant variant stays built behind the same flag as the reversal path (FR-6.5). Disclosure text is still a hard M3 gate — accepted in principle is not the same as signed. | — | M3 |

**Q2, Q3, Q4 and Q6 are all blocked on facts that do not exist yet** — there is no signed pilot café and no confirmed operating entity. None of them blocks Sprint 0 through Sprint 6. They become live the moment a café signs, and Q2 and Q6 are hard M3 gates at that point.

---

## 12. The one-paragraph version

Build a correct system of record before building anything that reads from it. Put every mutation behind one API so the material and money invariants are provable rather than hoped-for; make history append-only and versioned so yesterday's numbers stay true; keep the two deliberately fragile WhatsApp and review dependencies behind hard isolation boundaries with pre-built escape hatches so neither can take down the ordering loop or the business. Give the café owner a console that configures everything they should control and nothing that would make the product untrustworthy, and give myself a fleet console that is separate, hardware-key-gated, fully audited, and never the only path to a kill switch. Ship the ordering loop by week 8, the counter by week 12, a pilot that changes its own menu by week 18, retention by week 22, GA by week 28 — with four things the PRD did not ask for (Arabic, item availability, void authorization, store hours) promoted to P0 because the product is not shippable in Cairo without them. Keep it to five deployables, one database, one queue, and one configuration model, because the person operating it at 08:30 on a Tuesday is the same person who wrote it.
