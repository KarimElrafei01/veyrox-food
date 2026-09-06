# Veyrox Food

WhatsApp-native operating layer for independent Egyptian cafés. Solo build by
**Veyrox AI** (`veyroxai.com`).

`docs/` is the spec of record — start at `docs/00-master-plan.md`. Agent working
rules are in `CLAUDE.md` / `AGENTS.md`.

## Status

Sprint 0 (foundations) in progress. This commit set covers the monorepo, the
toolchain, the local dev environment, the `@veyroxai/domain` money core, and
`@veyroxai/db` (schema, migrations, RLS, seed, cross-tenant leak suite). Still to
come this sprint: CI/CD, observability wiring, the Fiwano messaging adapter, and
the message → KDS ticket walking skeleton (M0).

## Prerequisites

- Node 22 (`.nvmrc`)
- pnpm 12 — `npm i -g pnpm@12` (or `corepack enable` if you can write to the Node dir)
- Docker (for local Postgres + Redis)

## Quickstart

```bash
pnpm install
cp .env.example .env
pnpm compose:up          # Postgres 16 + Redis 7
pnpm db:generate         # regenerate Drizzle schema SQL (first run / after schema edits)
pnpm db:migrate          # apply pre/ + generated + post/ migrations
pnpm db:seed             # pilot menu (placeholder costs)
pnpm dev                 # api :3001 · order :3002 · kds :3003 · worker
```

## Scripts

| Command                                       | What                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                                    | api, worker, order, kds in watch mode                             |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | across every workspace                                            |
| `pnpm test`                                   | unit + property tests (fast, no services)                         |
| `pnpm test:int`                               | integration against the Docker Postgres (needs `pnpm compose:up`) |
| `pnpm db:generate` / `db:migrate` / `db:seed` | schema tooling                                                    |
| `pnpm format`                                 | Prettier write                                                    |

Whole suite budget: **under 5 minutes** (NFR-59).

## Layout

```
apps/api        Fastify — the single write path
apps/worker     BullMQ jobs — same image, different entrypoint
apps/order      Customer webview (Vite + React 19)
apps/kds        Barista kitchen display
                (till, console, admin scaffolded in later sprints)

packages/domain         Money (branded Minor), and later pricing/ETA/loyalty
packages/db             Drizzle schema + migrations + RLS + seed
packages/contracts      Zod → validation + types + OpenAPI
packages/observability  Logger + redaction (phone numbers never logged)
packages/testkit        Real-Postgres provisioning for integration tests
packages/i18n           en (default) + ar-EG catalogs, RTL helpers
packages/ui             Design tokens, direction helpers
packages/api-client     Typed client (generated later from contracts)
packages/ops-core       Shared kds/till device layer (populated in S3–S4)
```

## Conventions worth knowing before your first commit

- **Conventional Commits with a scope** — `feat(till):`, `fix(ledger):`, `docs(adr):`.
  `commitlint` enforces the scope list.
- **Money is `Minor` (piastres), never a raw number** — a lint rule blocks arithmetic
  on `*_minor` identifiers (ADR-0007).
- **Every table is tenant-scoped with RLS** (ADR-0008). The cross-tenant leak suite
  runs on every merge.
- **`material_ledger` and `order_events` are append-only** — enforced by trigger _and_
  by revoked grants. Voiding negates exact rows; it never recomputes from recipes.
- **Migrations are forward-only, expand/contract.** Hand-written SQL that Drizzle
  cannot express lives in `packages/db/drizzle/pre/` and `.../post/`.
