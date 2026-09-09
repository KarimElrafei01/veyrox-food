# Architecture Decision Records

One record per material decision, written **before** the code (NFR-61). Format: context, decision, alternatives with why they lost, consequences including the bad ones, and what would reverse it.

The reasoning is the point. Code shows *what* was decided; only these show *why*, and why is the part that cannot be reverse-engineered by whoever inherits this.

**Superseding, not editing.** When a decision changes, the new ADR keeps the same number, states what it supersedes and on what date, and explains what changed in the reasoning. The old file is removed from the tree but stays in git history — the record of a decision that was wrong is worth as much as the record of one that was right.

| ADR | Decision | Status |
|---|---|---|
| [0001](ADR-0001-monorepo-typescript-fastify.md) | TypeScript monorepo, Node 22, Fastify | Accepted |
| [0002](ADR-0002-postgres-neon-drizzle.md) | Postgres on Neon; Drizzle; custom auth; no BaaS | Accepted · supersedes Supabase 2026-09-06 · amended 2026-09 (Neon CLI + neon.ts) |
| [0003](ADR-0003-messaging-rails.md) | Cloud API + webview for ordering; isolated whatsapp-web.js for habits | Accepted |
| [0004](ADR-0004-jobs-bullmq-not-n8n.md) | BullMQ on Redis; n8n dropped; Cairo-timezone schedules | Accepted |
| [0005](ADR-0005-server-push-sse.md) | Server push over SSE with event replay; no polling | Accepted · supersedes Supabase Realtime, 2026-09-06 |
| [0006](ADR-0006-offline-outbox.md) | Offline-first Ops app via IndexedDB outbox and idempotency keys | Accepted |
| [0007](ADR-0007-money-and-cost-precision.md) | Money as integer minor units; costs as NUMERIC(14,6) | Accepted |
| [0008](ADR-0008-tenancy.md) | Tenant-scoped schema and RLS from commit one | Accepted |
| [0009](ADR-0009-frontend-spas.md) | Five Vite React SPAs, no SSR · KDS/Till split amended 2026-09-06 | Accepted |
| [0010](ADR-0010-payments-paymob.md) | No payment provider in v1; cash on pickup + kitchen-accept gate | Accepted · supersedes Paymob checkout, 2026-09-05 |
| [0011](ADR-0011-hosting-phased.md) | Phased hosting: ~$4/mo now, migratable without re-architecture | Accepted · supersedes single-phase hosting, 2026-09-06 |
| [0012](ADR-0012-observability.md) | OpenTelemetry to Grafana Cloud, plus Sentry | Accepted |
| [0013](ADR-0013-ai-deterministic-core.md) | Deterministic statistics for numbers; the LLM only phrases | Accepted |
| [0014](ADR-0014-platform-admin-separate-deployable.md) | Platform Admin as a separate deployable with its own auth realm | Accepted |
| [0015](ADR-0015-configuration-model.md) | Three-layer configuration model, settings registry, versioned CRUD | Accepted |
| [0017](ADR-0017-immutable-menu-publications.md) | Immutable menu publications for customer sessions | Accepted |
| [0016](ADR-0016-whatsapp-provider-strategy.md) | WhatsApp via Fiwano (Tech Provider), per-café WABAs, behind a MessagingChannel adapter | Accepted · final 2026-09-06 |
| [0018](ADR-0018-frontend-feature-layering.md) | Frontend: Brew & Baladi design system in packages/ui (CSS tokens, no Tailwind), six-folder feature layout, response contracts in packages/contracts | Accepted · supersedes the 2026-09-06 four-layer record, 2026-09-09 |
| [0019](ADR-0019-workspace-layout-and-context-uniformity.md) | Git root holds docs/ + code/; one backend with lint-enforced context walls; every context carries four layer folders; no git worktrees | Accepted · amends 0001 and the 0009 worktree note, 2026-09-09 |
| [0020](ADR-0020-order-placement-snapshot-provenance.md) | Placement freezes charged price, recipe/price versions and cost onto order_items; daily order_number sequence; frozen placement response | Accepted 2026-09-06 · registered 2026-09-09 (was a second 0018) |
