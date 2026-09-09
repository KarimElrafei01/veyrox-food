# Veyrox Food — Working Guide

WhatsApp-native operating layer for independent Egyptian cafés: ordering, KDS, counter till, owner analytics, retention. Solo build. Org **Veyrox AI** (`veyroxai.com`). Product **Veyrox Food**.

`veyrox-food-prd.md` is the product brief. **`docs/` is the spec of record** — if code and `docs/` disagree, one is a bug. Start at `docs/00-master-plan.md`; `docs/README.md` maps the rest.

## Working rules

1. **ADR before decision.** Any material technical decision gets `docs/adr/ADR-nnnn-*.md` written first. Changing an existing decision means **superseding** its ADR (keep the old reasoning), never editing it silently.
2. **Resolve observable-behaviour conflicts before coding.** When documents disagree on observable behavior, stop implementation, document the conflict, and resolve it through an ADR or specification correction before coding.
3. **Keep agent guides synchronized.** When changing an agent-guide rule, update both `CLAUDE.md` and `AGENTS.md` in the same change so Claude and Codex follow the same policy.
4. **Docs stay in sync in the same pass.** A behaviour change updates the affected FR / NFR / data-model / sprint docs together, and names the knock-on effects.
5. **State schedule impact explicitly.** Scope changes come with a milestone delta and what they displace. Never absorb scope silently.
6. **Never weaken a non-negotiable** (below). Propose an alternative instead.
7. **Branch discipline.** An agent never commits to `main` and never `git push`. All work happens on a short-lived branch off `main`; commit there and stop — a human runs the merge and the push. When two agents work in parallel, each uses its own `git worktree` so one checkout is never shared.

## Non-negotiables

- **Ledger.** Materials move only through append-only `material_ledger`. Voiding inserts the **exact negation** of that order's `sale_deduction` rows via `reverses_ledger_id` — it **never recomputes from `recipes`**. A recipe edited between send and void would otherwise return the wrong quantity, silently and cumulatively. `docs/04-data-model.md` §1.
- **Abandoned ≠ voided.** Void (before prep) returns materials. Abandon (after prep) does **not** — the milk is gone; it is waste. INV-7.
- **Snapshots.** `order_items` freeze price, cost, recipe version, menu-price version, and names. Yesterday's report must never change. NFR-19.
- **Single write path — and single read path.** **No client ever connects to Postgres.** Every mutation and every live update goes through `apps/api`. RLS stays as defence in depth, scoped by `SET LOCAL app.tenant_id`.
- **Schema lives in Drizzle migrations, never in a vendor dashboard.** This is what keeps every exit a `pg_dump`.
- **No polling.** Live updates are SSE with `Last-Event-ID` replay off `order_events`. Heartbeat every 20s, gap cap → one snapshot, staleness banner always. ADR-0005.
- **Money = integer minor units** (piastres) with a branded `Minor` type. **Material costs = `NUMERIC(14,6)`.** No floats. Round once, at display. ADR-0007.
- **Tenant-scoped everywhere.** `tenant_id` on every table, index, and query. RLS on all of them.
- **Idempotent everything.** Mutations take `Idempotency-Key`; replays return the original response, not 409. Re-entering an order's current state is a 200 no-op — baristas double-tap.
- **Server-side pricing.** Request contracts carry no price field. Ever.
- **PII.** Phone numbers are never logged. Redaction happens at emit in `packages/observability`; lookups use keyed `phone_hash`.
- **RTL from the first screen.** English is default, Arabic is offered — both directions must be correct. Retrofitting costs 3–4x.
- **Habit rail isolation.** Separate host, separate number, `habit_reader` role with SELECT on one 4-column view and nothing else. `docs/10-risk-containment.md`.

## Layout

Full detail and rationale: `docs/14-code-structure-and-conventions.md`. Feature-level specs with exact API contracts, indexes, and caching: `docs/features/`.

```
apps/api          Backend · DDD bounded contexts · the single write path
apps/worker       BullMQ jobs · same image as api
apps/order        Customer webview · strictest perf budget
apps/kds          Barista kitchen display
apps/till         Cashier counter
apps/console      Store Console — owner analytics, costing, CRUD
apps/admin        Platform Admin — fleet ops, WebAuthn realm

packages/domain          Shared kernel: money, pricing, ETA, loyalty, feature resolver
packages/contracts       Zod → validation + types + OpenAPI
packages/db              Drizzle schema + migrations
packages/ops-core        Shared by kds + till: offline outbox, service worker,
                         device enrollment, staff PIN, SSE client
packages/ui · i18n · api-client · observability · testkit
```

`apps/api` per context: `domain/` (pure) · `application/` (use cases) · `infrastructure/` (Drizzle, adapters) · `interface/` (thin HTTP).

Anything deciding a price, cost, quantity, tier, or transition lives in `packages/domain` or a context's `domain/` — **never in a route handler**. That is what stops the Till and the dashboard disagreeing by 0.25 EGP.

## Code rules

**Simplicity governs.** Write the simplest thing that satisfies the requirement.

- **No abstraction without a second caller.** No interface with one implementation, no factory producing one type. Rule of three.
- **No repository interfaces "for testability"** — integration tests use real Postgres.
- **Rich domain only where invariants live** (ordering, inventory, loyalty). Catalog and platform are plain services over repositories. **A menu item does not need an aggregate root because a pattern book says so** — if you cannot name the invariant it protects, don't build one.
- **Contexts communicate via events**, never direct imports of each other's internals.
- **Domain layer is pure**: no I/O, no Drizzle, no Fastify, no clock, no randomness.
- Guard clauses over nesting, max depth 3. Plain functions over classes. No barrel files. No `any` without justification.
- **Comments explain WHY, never WHAT.** If a comment describes what the code does, rename the thing instead. Always comment invariant-protecting code — especially the ledger negation, which looks "simplifiable" into a recipe recomputation and must not be.
- Name things as a café person would: `void`, `abandon`, `eightySix`, `ticket`. The domain language in `docs/` is the domain language in code.

## Stack

TypeScript strict · Node 22 · pnpm + Turborepo · Fastify + Zod · **Postgres 16 on Neon** (no BaaS) · Drizzle · **custom auth, all four realms** · **SSE server push, no polling** · BullMQ on Redis (**not** n8n) · Vite + React 19 SPAs on Cloudflare Pages · Cloudflare R2 · OTel → Grafana Cloud + Sentry.

**Hosting is phased** (ADR-0011): Phase 0 ~$4/mo (Neon free + one Hetzner VPS running api/worker/Redis) → Phase 1 at M3 (Neon paid for PITR, Fly.io ×2) → Phase 2 at GA. Phase 0 knowingly misses NFR-1/20/21; **restoring them is an M3 gate.**

**v1 has no payment provider** — cash on pickup, plus the café's own terminal as a `visa` label. A **kitchen-accept gate** replaces the commitment prepayment used to provide. ADR-0010.
**One store QR**, not per table. Counter pickup by default. DEC-01.
**WhatsApp: Fiwano** (verified Meta Tech Provider), $12–19/mo per café, each café owns its WABA. Behind a `MessagingChannel` adapter so going direct on Cloud API later is a swap, not a rewrite. ADR-0016.

## Conventions

- All jobs declare `tz: 'Africa/Cairo'` — **Egypt observes DST**; a UTC cron drifts the 22:00 digest by an hour for half the year.
- Timestamps stored UTC, rendered in tenant timezone.
- Errors are RFC 9457 problem details with a stable `code` and a `traceId`. Clients switch on `code`, never on prose.
- Migrations are **forward-only, expand/contract**. The previous image must run against the new schema — that is what makes rollback a 3-minute redeploy.
- No literal strings in rendered components (CI fails).
- Config resolves **platform capability → tenant entitlement → tenant preference**. Clients get *resolved state with a reason*, never raw flags. A key absent from `setting_definitions` cannot be set by anyone. ADR-0015.
- Commits: **Conventional Commits** with scopes — `feat(till):`, `fix(ledger):`, `docs(adr):`. Short-lived branch off `main`, squash-merge, `main` always deployable. Agents commit on the branch only — never to `main`, never `git push` (working rule 7).
- **Frontend feature layering** (`apps/*` SPAs): each feature folder separates `ui/` (presentational screens + components — props in, callbacks out, no fetch), `hooks/` (React glue calling usecases, holding loading/error/data), `usecases/` (pure orchestration over repos — testable without React), `repo/` (one backend call each: build request, parse the Zod response, return typed data or throw `ApiError`). ADR-0018.

## Commands

*(Scaffold does not exist yet — Sprint 0 is the next task. These are the intended contracts.)*

```
pnpm dev            all apps + workers  (loads .env from repo root)
pnpm compose:up     local Postgres + Redis via Docker  (blessed path)
                    — or point .env at a Neon branch + hosted Redis (ADR-0002 amendment)
pnpm test           unit + property (fast-check)
pnpm test:int       integration against real Postgres
pnpm test:e2e       Playwright, 7 journeys
pnpm typecheck / lint / build
pnpm db:generate / db:migrate / db:seed
neon deploy         apply neon.ts project/branch policy to the linked Neon branch — HUMAN-RUN,
                    after review; never an agent. Schema still lives in Drizzle migrations (ADR-0002)
```

Whole suite must stay **under 5 minutes**. A slow suite gets skipped, and there is nobody to catch what was skipped.

## Merge gate

Typecheck · lint · unit + property · `domain` coverage · integration · contract · cross-tenant leak · offline suite · `axe` · `size-limit` (≤150 KB gz on `apps/order`) · OpenAPI regenerates without diff. Plus two manual checks that stay manual: **ordering-path changes verified inside the WhatsApp in-app browser** (iOS + Android), and **schema changes proven expand/contract**.

## State of play

**Nothing is built.** `docs/` is complete; next task is **Sprint 0** (`docs/06-sprint-plan.md`) → M0 walking skeleton: a real WhatsApp message becomes a KDS ticket in under 1s, with CI/CD, observability, and rollback working.

**No pilot café is signed.** "Brew & Baladi" is the PRD fictional persona. Until one signs, seed costs carry `source='placeholder'` and the console **refuses to render a margin** (FR-5.14) — that stays a hard M3 gate, now phrased as "the pilot café has entered its own real costs."

**All PRD open questions are now closed.** 2026-09-05: Q1 (no PSP) · Q5 (English-primary, Arabic secondary; RTL still P0) · Q7 (table prompt off) · Q8 (abandon 30 min, no-show 3/90 days). 2026-09-06: Q2 (each café enters its own supplier costs) · Q3 (**e-invoicing is v2** — no Tax Authority submission in v1; fields still carried) · Q4 (habit number is the **café's own second line**) · Q6 (cafés accept the R1/R2 disclosure).

**Naming:** **ETA means only the customer's estimated time of arrival.** The Egyptian Tax Authority regime is called **e-invoicing** everywhere. They collided once; they must not again.

**Two consequences of Q4 to keep in view:** one whatsapp-web.js session *per café* does not scale linearly (NR-9 — the Cloud API migration trigger is now partly economic, computed at M4), and a ban costs the *café's* number, which makes the written R1 disclosure required rather than courteous.

**Naming, settled:** everything is `veyroxai` — npm scope `@veyroxai/*`, domain `veyroxai.com` (`api.` / `order.` / `ops.` / `console.` / `admin.`), Fly apps `veyroxai-api` / `veyroxai-worker`, DB role `veyroxai_app`, CLI `veyroxai`.

**Still needed before Sprint 0 ends:** Meta Business Verification for Veyrox AI (raises the number cap 2 → 20 and is needed for Tech Provider later).

**Meta claims verified against live docs 2026-09-06** (ADR-0016). Two things to carry: (a) **messaging limits are portfolio-wide since 7 Oct 2025** — on a BSP, one café's flagged number drops *every* café's capacity, which is why per-tenant send caps are load-bearing; (b) **Embedded Signup v2 dies 15 Oct 2026** — build against v4. Business Verification is *not* an onboarding gate (unverified = 250 business-initiated conversations/day, and our flow is customer-initiated). Re-check the service-message pricing question in early October — official docs and third-party sources disagree.

## Two accepted risks — contain, do not re-litigate

- **R1** — the Habit Engine runs on whatsapp-web.js, which violates WhatsApp ToS. Explicitly accepted. Job is containment: isolation, conservative sending, freeze-not-reconnect on auth failure, and a **Meta-approved Cloud API fallback sitting unused** before M4.
- **R2** — Review Shield's rating-based routing is likely non-compliant. Accepted. Flag-wrapped, fully audited, compliant variant already built behind the same flag. **The voucher is never in the same message as a public-review ask.**

Both are business decisions already made. Improve the blast radius, not the decision.
