# Veyrox Food — Agent Guide

## Purpose and source of truth

Veyrox Food is a WhatsApp-native operating system for independent Egyptian cafés: customer ordering, KDS, counter Till, owner operations, analytics, retention, and fleet administration.

This repository is currently **documentation only**. The next implementation work is Sprint 0 in `docs/06-sprint-plan.md`; do not assume an application scaffold or existing runtime conventions that are not yet present.

`docs/` is the specification of record. If code and docs disagree, treat it as a bug and reconcile both in the same change. Use this reading order for work:

1. `docs/00-master-plan.md` — priorities, milestones, scope, and launch gates.
2. The relevant functional/NFR, design, schema, API, test, operations, security, risk, and configuration documents.
3. `docs/adr/` — the reasoning behind a material technical decision.
4. `veyrox-food-prd.md` — original product source material. Later docs and ADRs explicitly supersede PRD details where they differ.

## Required engineering workflow

- Make the smallest complete change that satisfies the relevant numbered requirements (FR/NFR).
- Before a material architecture, dependency, data-model, hosting, security, or integration decision, add an ADR in `docs/adr/`. Do this before implementation.
- Do not silently alter an accepted decision. Supersede the ADR, retaining its history and explaining the changed rationale.
- When documents disagree on observable behavior, stop implementation, document the conflict, and resolve it through an ADR or specification correction before coding.
- When changing an agent-guide rule, update both `AGENTS.md` and `CLAUDE.md` in the same change so Codex and Claude follow the same policy.
- Update affected docs in the same pass as behavior changes: requirements, schema/contracts, tests, sprint plan, runbooks, and/or risk controls as applicable.
- State schedule impact for any scope change: milestone delta and what is displaced. Use the explicit cut list in `docs/00-master-plan.md`; never silently absorb scope.
- Keep `main` deployable. Use Conventional Commits with scopes, e.g. `feat(till):`, `fix(ledger):`, `docs(adr):`.
- **Branch discipline.** Never commit to `main`, never `git push`. Work on a short-lived branch off `main`, commit there, and stop — a human runs the merge and the push. When agents work in parallel, each uses its own `git worktree` so one checkout is never shared.
- Do not weaken a non-negotiable to make a feature easier. Propose an alternative.
- **Frontend feature layering** (`apps/*` SPAs): separate `ui/` (presentational — no fetch, no rules), `hooks/` (React glue over usecases), `usecases/` (pure orchestration over repos), `repo/` (one backend call each — build request, parse the Zod response, return typed data or throw `ApiError`). ADR-0018.

## Intended repository and stack

```text
apps/api       Fastify API; DDD bounded contexts; the only database write/read path
apps/worker    BullMQ workers; same image as API, different entry point
apps/order     public Vite/React customer webview; strict performance budget
apps/kds       Barista kitchen display; offline-first PWA
apps/till      Cashier counter; offline-first PWA
apps/console   Store Console for owner analytics, configuration, and CRUD
apps/admin     Platform Admin; separate deployable and auth realm
packages/domain          shared kernel: money, pricing, ETA, loyalty, feature resolver
packages/contracts       Zod schemas, TypeScript types, generated OpenAPI
packages/db              Drizzle schema and forward-only migrations
packages/ops-core        shared by kds + till: offline outbox, service worker,
                         device enrollment, staff PIN, SSE client
packages/ui              tokens and RTL-aware primitives
packages/i18n            en default + ar-EG catalogues and RTL helpers
packages/auth            custom auth for customer, staff, owner, and admin realms
packages/api-client      typed client generated from contracts
packages/observability   OTel, logging, emit-time redaction
packages/testkit         fixtures, factories, webhook replay corpus
```

KDS and Till are separate apps by decision, but every device-shaped concern lives once in `packages/ops-core`. Do not duplicate the outbox, service worker, device enrollment, PIN flow, or SSE client between them.

Use TypeScript strict, Node 22, pnpm workspaces, Turborepo, Fastify, Zod, Postgres 16 on Neon, Drizzle, Redis/BullMQ, Vite/React SPAs, Cloudflare Pages/R2, SSE, OTel, Grafana Cloud, and Sentry. WhatsApp goes through **Fiwano** (verified Meta Tech Provider, per-café WABA) behind a `MessagingChannel` adapter with a `CloudApiChannel` sibling, so the provider stays swappable — see ADR-0016. Do not add BaaS, n8n, polling, a payment provider, Kubernetes, a message broker, or direct client database access without an ADR that supersedes the relevant decision.

## Code structure and simplicity

Full detail: `docs/14-code-structure-and-conventions.md`.

### Backend — DDD applied where it earns its place

`apps/api/src/contexts/<context>/` with four layers: `domain/` (pure), `application/` (use cases), `infrastructure/` (Drizzle, adapters), `interface/` (thin HTTP). Contexts: ordering, catalog, inventory, loyalty, payments, messaging, identity, platform, analytics.

- Contexts communicate through domain events. A context may import another's published events and public types, never its repositories, aggregates, or internals.
- The domain layer is pure: no Drizzle, no Fastify, no clock, no randomness. Clock and IDs are injected.
- Aggregates own invariants and transaction boundaries. The application layer only orchestrates: load, call domain, persist, publish. Route handlers contain no business logic.
- **Rich domain only where invariants live** — ordering, inventory, loyalty. `catalog`, `platform`, and `identity` are plain services over repositories; `analytics` is read models and SQL with no domain layer. **A menu item does not get an aggregate root because a pattern book says so.** If you cannot name the invariant an aggregate protects, do not build one.

### Frontends — feature-first

`apps/<app>/src/features/<feature>/` holds everything that feature needs. No global `components/`, `hooks/`, or `utils/` folders. Promote to app-level `shared/` on the second use inside an app, to a package on the second app.

### Simplicity rules

- Write the simplest thing that satisfies the requirement.
- **No abstraction without a second caller.** No interface with one implementation, no factory producing one type, no generic with one instantiation. Rule of three.
- No repository interfaces created solely for mocking; integration tests run against real Postgres.
- Guard clauses over nesting, maximum depth 3. Plain functions over classes; classes only for aggregates. No barrel files. No `any` without an inline justification.
- Parse at boundaries with Zod, then trust the type. Use branded types (`Minor`, `PhoneE164`, `TenantId`) and discriminated unions over optional-field soup.
- Domain errors are typed and named for the rule broken (`ItemUnavailable`, `InvalidTransition`); the interface layer maps them to problem details with stable codes.

### Comments and naming

- **Comments explain WHY, never WHAT.** If a comment describes what the code does, rename the code instead.
- Always comment invariant-protecting code — in particular the ledger negation, which looks like it could be "simplified" into a recipe recomputation and must not be.
- Name things as café staff would: `void`, `abandon`, `eightySix`, `ticket`, `accept`, `collect`. The domain language in `docs/` is the domain language in code.

## Non-negotiable correctness rules

### Ledger and history

- Material movements are inserts in append-only `material_ledger`; there is no mutable stock quantity.
- A void must negate the exact `sale_deduction` rows using `reverses_ledger_id`. **Never recompute a void from the current recipe.** The unique reversal constraint must prevent a second return.
- `abandoned` is waste, not a void: it does not return materials. `rejected` has neither deduction nor return.
- Prices, menu prices, recipes, material costs, and order-line names are versioned/snapshotted. Historical reports must remain byte-identical after later edits.
- Money is integer minor units (`Minor`, piastres) end-to-end. Costs are `NUMERIC(14,6)`. No floating-point arithmetic in money/cost paths; round only for display.
- Append-only cores (`material_ledger`, `loyalty_ledger`, `order_events`, inbound/outbound events, audits) are corrected with compensating rows, never updates/deletes.

### Order, payment, and pricing behavior

- There is no PSP in v1. An order is paid only when an attributed staff member records `cash` or `visa` at collection; `visa` labels the café's own terminal transaction.
- Server-side code computes all prices. Customer contracts send IDs and quantities, never prices. Do not trust or persist a client-supplied price.
- Sending an order to the kitchen creates `pending`. Kitchen Accept transitions it to `received` and deducts materials exactly once; public placement and send-to-kitchen deduct nothing.
- All mutations require an `Idempotency-Key`; replay returns the original response. Re-entering a current state is a `200` no-op, not an error.
- State changes are explicit and audited. Void/refund authorization, manager PIN, actor attribution, and reason codes are fraud controls, not optional UI behavior.

### Tenancy, privacy, and authorization

- No client connects to Postgres. All reads, writes, and live updates go through `apps/api`; RLS is defense in depth with transaction-scoped tenant context.
- Every tenant-owned table, query, and hot-path index is tenant-scoped. Preserve RLS and cross-tenant leak tests.
- Phone numbers are PII: store/use E.164 and keyed `phone_hash` appropriately; never log phone numbers, tokens, or message bodies. Redaction happens at emission in `packages/observability`.
- Do not store message bodies. Store template metadata, parameters as appropriate, and content hashes.
- Suppressions survive customer erasure and must be honored by both message rails.
- Platform Admin is separate from Store Console, requires hardware-key WebAuthn with no password fallback, and every mutating action needs a reason, audit row, and CLI equivalent.

### Configuration, data changes, and UI

- Resolve behavior only through `resolveFeature()` in `packages/domain`: platform capability → tenant entitlement → tenant preference. Clients receive resolved state and reason, never raw flags.
- A setting not listed in `setting_definitions` cannot be written. Enforce registry ownership, bounds, and `owner_editable` server-side.
- Prices, recipes, and costs create versions; data with history is archived, not hard-deleted. Menu edits stage then publish atomically; availability/86-ing changes are immediate.
- English is the default and Arabic (`ar-EG`) is supported from the first screen. Implement true RTL, mirrored directional icons, and bidi-safe number/currency presentation. No literal rendered UI strings.
- Keep the customer webview within 150 KB gzipped initial JS, 20 KB initial CSS, no third-party scripts, and the mobile/WhatsApp in-app-browser constraints.

## Realtime, jobs, and integrations

- Use SSE only for staff live updates. Send a 20-second heartbeat, replay with `Last-Event-ID`, send one board snapshot after the gap cap, and always show a staleness indicator. Do not introduce polling.
- Jobs use BullMQ/Redis, are idempotent, record `job_runs`, expose a manual CLI entrypoint, and declare `tz: 'Africa/Cairo'`. Store timestamps in UTC.
- Webhooks verify signatures against raw bytes before parsing, dedupe at the edge, enqueue work, and acknowledge Meta in under 500 ms.
- The Habit Engine is a contained accepted risk: separate host, number, provider, egress, secrets, and `habit_reader` with access only to `vw_habit_targets`; its sole write-back is the narrow mTLS outcome endpoint. Freeze on auth failure; do not reconnect-storm. Keep the official `HabitChannel` fallback ready.
- Review gating is accepted but must remain flag-wrapped, fully audited, and paired with a tested compliant variant. Never place a recovery voucher in the same message as a public-review request.
- AI add-ons may phrase deterministic inputs only. Compute every number in TypeScript; validate structured model output and fall back to the deterministic table. Never send customer PII to an LLM.

## Schema and deployment discipline

- Put schema changes in Drizzle migrations committed to git; never use a vendor dashboard as schema state.
- Migrations are forward-only expand/contract. The previous image must run against the new schema. Never make rollback depend on reversing a migration.
- Preserve append-only triggers/grants, RLS, uniqueness constraints, and database checks as structural safeguards; do not rely only on application code.
- Prefer simple, managed, reproducible components. Local development must work with `pnpm dev` plus `docker compose up` (Postgres and Redis); no cloud-only or GUI-configured behavior.
- Phase-0 hosting knowingly misses HA/RPO targets only before M3. Do not represent it as production-ready before the M3 restoration gate.

## Testing and validation

Run the relevant intended commands once scaffolded:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm test:int
pnpm test:e2e
pnpm build
pnpm db:generate
pnpm db:migrate
```

The merge gate requires typecheck, lint, unit/property tests, domain coverage (90% line, 100% branch), real-Postgres integration tests, contracts, cross-tenant leak tests, offline suite, axe, size limit, and OpenAPI regeneration without a diff. Keep the full suite under five minutes.

When changing these areas, add/adjust the corresponding high-value coverage:

- Ledger, price, ETA, loyalty, state machine, idempotency, and feature resolver: pure unit plus property tests in `packages/domain`.
- Database constraints, RLS, serializable void behavior, versioning, deletion/archive guards, admin authorization, and DSR: real Postgres integration tests.
- Meta, Foodics, and LLM boundaries: replay/golden contract tests.
- Till: offline/reload/partial-flush test with no missing or duplicated orders and exactly one ledger deduction set.
- UI: RTL/en visual coverage, accessibility, and the customer bundle budget.
- Schema change: prove expand/contract and previous-image compatibility.
- Ordering-path change: manually verify inside WhatsApp's in-app browser on iOS and Android before merge.

## Operational expectations

- Design degraded behavior explicitly: counter/Till continues offline; SSE reconnects and exposes staleness; optional/risky surfaces can be disabled independently.
- `safe_mode` keeps orders, KDS, Till, offline outbox, and payment recording while disabling optional behavior. Kill switches must take effect within 60 seconds and have both Admin and CLI paths.
- Page only for immediate money/data risk; otherwise ticket. Every page alert needs a runbook.
- On an invariant violation: snapshot and scope first, freeze the affected path if necessary, and correct via documented compensating ledger rows only. Never mutate evidence.
- Do not schedule normal production deploys during Cairo rush windows (07:00–11:00, 17:00–21:00) or Friday afternoon.

## Change checklist

Before handing off a change, confirm:

- [ ] Relevant docs and ADRs were read and remain synchronized.
- [ ] `AGENTS.md` and `CLAUDE.md` were updated together if an agent-guide rule changed.
- [ ] Code follows `docs/14`: correct context/layer, no abstraction without a second caller, comments explain why.
- [ ] No non-negotiable was weakened.
- [ ] Tenant scope, auth realm, idempotency, auditing, and PII handling were considered.
- [ ] History is immutable/versioned wherever facts can change over time.
- [ ] New configuration uses the three-layer resolver and registry.
- [ ] API schemas/contracts/OpenAPI and problem-detail codes are updated together.
- [ ] Relevant automated checks and required manual checks passed.
- [ ] Operational degradation, observability, flags, and runbooks were updated when behavior changed.
- [ ] Scope/schedule impact is explicit for non-trivial additions.

## Key reference map

| Work area | Read first |
| --- | --- |
| Architecture and flows | `docs/01-system-design.md` |
| Feature behavior | `docs/02-functional-requirements.md` |
| SLIs, performance, resilience | `docs/03-non-functional-requirements.md` |
| Schema, ledger, RLS, retention | `docs/04-data-model.md` |
| Endpoints, webhooks, SSE | `docs/05-api-and-integration-contracts.md` |
| Current sequence and exits | `docs/06-sprint-plan.md` |
| Test strategy and merge gate | `docs/07-test-and-quality-strategy.md` |
| Incidents and releases | `docs/08-operations-runbooks.md` |
| Security and PDPL | `docs/09-security-privacy-compliance.md` |
| Habit rail and review-gating risks | `docs/10-risk-containment.md` |
| Added scope and explicit PRD reductions | `docs/11-prd-gap-analysis.md` |
| Team, capacity, and hiring | `docs/12-team-and-operating-model.md` |
| Store Console, Admin, and settings | `docs/13-admin-and-configuration.md` |
| Folder layout, DDD boundaries, code rules | `docs/14-code-structure-and-conventions.md` |
| Implementing a feature | `docs/features/` — subfeature specs, exact contracts, indexes, caching |
| Why a decision exists | `docs/adr/README.md` and the relevant ADR |
