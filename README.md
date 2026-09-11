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
- **Postgres + Redis** — either Docker (`pnpm compose:up`) or a hosted pair. See
  "Local database" below; ADR-0002.

## Quickstart

```bash
cd code                  # the workspace root (ADR-0019)
pnpm install
cp .env.example .env     # then fill in DATABASE_URL / DATABASE_ADMIN_URL / REDIS_URL
pnpm db:migrate          # apply pre/ + generated + post/ migrations
pnpm db:seed             # pilot menu (placeholder costs)
pnpm dev                 # api :3001 · order :3002 · kds :3003 · worker
```

`db:migrate`, `db:seed`, and the API load `code/.env` automatically
(`--env-file-if-exists`); `pnpm test:int` still needs the two `DATABASE_*` vars
exported.

## Local database

The blessed path is **Docker** — `pnpm compose:up` brings up Postgres 16 + Redis 7
with roles and init wired (`infra/`). On a machine without Docker, point `.env` at
a **throwaway Neon branch** instead (ADR-0002, amendment 2026-09-07):

```bash
# one-off, as the Neon project owner:
CREATE ROLE veyroxai_app LOGIN PASSWORD '<pick one>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE <db> TO veyroxai_app;
GRANT USAGE ON SCHEMA public TO veyroxai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO veyroxai_app;
```

then set `DATABASE_URL` (the `veyroxai_app` role) and `DATABASE_ADMIN_URL` (the
project owner — it has `BYPASSRLS`, which migrations and the test harness need) to
the **direct** (non-pooled) connection strings. Redis is not on Neon: either point
`REDIS_URL` at a hosted instance, or set `REDIS_URL=memory` for an in-process shim
(every HTTP endpoint works; the webhook does not reach a worker).

Either way, recreate the database with `pnpm db:migrate && pnpm db:seed`, then:

```bash
pnpm --filter @veyroxai/api fixture   # modifiers, an 86'd item, a published menu,
                                      # four customers, orders — prints a curl kit
pnpm --filter @veyroxai/api fixture -- --load-customers=40
                                      # adds 40 idempotent, orderable load-* customers
pnpm --filter @veyroxai/api tokens    # reprint fresh 24h session tokens later
```

## Scripts

| Command                                       | What                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                    | api, worker, order, kds in watch mode                                                                                   |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | across every workspace                                                                                                  |
| `pnpm test`                                   | unit + property tests (fast, no services)                                                                               |
| `pnpm test:int`                               | integration against a real Postgres — `pnpm compose:up` or a Neon branch (export `DATABASE_URL` + `DATABASE_ADMIN_URL`) |
| `pnpm db:generate` / `db:migrate` / `db:seed` | schema tooling                                                                                                          |
| `pnpm format`                                 | Prettier write                                                                                                          |

Whole suite budget: **under 5 minutes** (NFR-59).

## Layout

Git root holds `docs/` and `code/`. `code/` is the pnpm + Turborepo workspace — run every
`pnpm` command from there (ADR-0019).

```
code/backend/api        Fastify — the single write/read path
code/backend/worker     BullMQ jobs — same image, different entrypoint
code/frontends/order    Customer webview (Vite + React 19)
code/frontends/kds      Barista kitchen display
                        (till, console, admin scaffolded in later sprints)

code/packages/domain         Money (branded Minor), and later pricing/ETA/loyalty
code/packages/db             Drizzle schema + migrations + RLS + seed
code/packages/contracts      Zod → validation + types + OpenAPI
code/packages/observability  Logger + redaction (phone numbers never logged)
code/packages/testkit        Real-Postgres provisioning for integration tests
code/packages/i18n           en (default) + ar-EG catalogs, RTL helpers
code/packages/ui             Design tokens, direction helpers
code/packages/api-client     Typed HTTP client (auth, base URL, problem details)
code/packages/ops-core       Shared kds/till device layer (populated in S3–S4)
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
