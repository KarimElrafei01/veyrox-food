# ADR-0002 — Postgres on Neon; Drizzle; custom auth; no BaaS

**Status**: Accepted · **Date**: 2026-09-06
**Supersedes**: ADR-0002 (Postgres via Supabase; Drizzle; PostgREST is not the write path), 2026-09-05.

## Context

The PRD specifies Supabase, and the original ADR-0002 kept it for the bundle: managed Postgres plus Auth, Realtime, and Storage from one vendor, with a local Docker stack. The reasoning was that a solo builder should buy the bundle rather than build three things.

Two things changed that argument on review:

1. **The bundle turned out to be one thin slice, not three.** We are already building three of the four auth realms ourselves — customer (signed token), staff (device enrollment + PIN), platform admin (WebAuthn). Supabase Auth was only ever covering the owner console's email-and-password. That is a small surface to accept a vendor dependency for.
2. **Realtime was already scoped down to almost nothing.** ADR-0005 deliberately treated it as an optimization with a fallback, never as truth, and the dual-write risk it protects against is largely absent here because T1 gives us a single write path — one place to publish from. See the superseding ADR-0005 for the replacement.

## Decision

- **Postgres 16 on Neon.** Database only. No BaaS layer.
- **Drizzle ORM + drizzle-kit** for schema and migrations — unchanged, and it was never Supabase-specific.
- **Custom auth**, owned in `apps/api` across all four realms (`09-security-privacy-compliance.md` §2).
- **Server-push over SSE** from our own API, not a vendor's WAL tailer (ADR-0005).
- **Cloudflare R2** for object storage (receipts, exports) — S3-compatible, zero egress fees.
- **Local development is `docker compose up`** — Postgres + Redis. No vendor CLI required.

## Why Neon specifically

| | Why it matters here |
|---|---|
| **Scale-to-zero, resumes in ~500ms** | The pre-pilot phase costs nothing and does not suffer Supabase's free-tier 7-day pause, which required a manual restore |
| **Database branching** | Per-PR preview environments — which Supabase's free tier flatly could not give us, since staging and production already consumed its 2-project cap |
| **Cheaper at scale** | The cost concern that prompted this review |
| **Plain Postgres 16** | Every exit stays `pg_dump`. Nothing here is Neon-specific |

## What we take on

**Auth.** Owner console: email + password (argon2id) + TOTP. Platform admin: WebAuthn. Both use the same primitives as the staff PIN flow we were writing regardless. Roughly a week of solo work, and it removes the stickiest piece of vendor lock-in in the original design.

**RLS changes role, and this is worth being precise about.** RLS is a Postgres feature and works identically on Neon. But its *job* changes: previously it was load-bearing, because Supabase Realtime and PostgREST let browsers touch the database directly. With no client ever connecting to Postgres, RLS becomes **defence in depth** rather than the primary control. We keep it — a leaked connection string or a query that forgets its `WHERE` clause is exactly what defence in depth is for, and multi-branch (§8.9) makes cross-tenant separation a real liability — but the tenant claim now comes from `SET LOCAL app.tenant_id` inside the request transaction rather than `auth.jwt()`.

The cross-tenant leak suite (`07-test-and-quality-strategy.md` §4) stays exactly as it was and matters just as much.

**One threat disappears.** T8 in the security model was "the Supabase anon key ships in the SPA bundle and must be assumed public." There is no anon key now. No client-side database credential exists at all.

## Alternatives considered

**Stay on Supabase.** Defensible, and it was the right call under the original reasoning. Rejected once the bundle was measured honestly: one auth realm and a realtime layer we had already downgraded to an optimization, against vendor lock-in on the two stickiest pieces and a free tier that pauses and caps projects at two.

**Neon plus a hosted auth vendor** (Clerk, WorkOS, Auth0). Rejected. It swaps one vendor for another on the *same* thin surface, adds per-MAU pricing, and we still have to build device+PIN and WebAuthn ourselves — so the bespoke code exists either way.

**Self-hosted Supabase on a VPS.** Rejected. Keeps the full API surface and the migration path, but means operating GoTrue, Realtime, Kong, and PostgREST on one box — several more services to run than the thing it replaces.

**RDS or self-managed Postgres.** Rejected for now: no scale-to-zero, no branching, more operational surface, and materially more expensive at pre-pilot volume.

## Consequences

**Good**: near-zero cost pre-pilot; per-PR preview environments via branching; no client-side database credential; no vendor lock on auth; local development needs only Docker; every exit remains `pg_dump`.

**Bad**: roughly a week of auth work we were previously buying, and we now own its security posture — which is a real cost, mitigated by the independent security review already scheduled before M5 (NFR-26). We also lose Supabase's dashboard, which was convenient for ad-hoc inspection; the Platform Admin's support tooling (FR-11.13) covers the cases that actually matter, and `psql` covers the rest.

## Amendment, 2026-09 — Neon CLI and `neon.ts` for project/branch policy

The Neon CLI (`neon`, npm `neon`) is added, with a `neon.ts` policy file at the repo root and
the project linked (`neon link --project-id … --branch production`). `neon deploy` (alias
`neon config apply`) reconciles the linked branch to that policy.

This does **not** move schema into a vendor surface — the two invariants from the Reversal section
hold unchanged:

- **Schema stays in Drizzle migrations.** `pnpm db:migrate` (`packages/db`) is still the only way
  tables change. `neon.ts` declares *project and branch configuration* — branch TTLs, the Neon Auth
  service toggle, env — not DDL. It ships as `defineConfig({})` (an empty baseline) and any addition
  is a code-reviewed diff in git, never a dashboard click.
- **Local development stays `docker compose up`.** The CLI is for managing the hosted project, not a
  local-dev dependency; `docs/12` §"Everything reproducible locally" is unaffected.

`neon deploy` runs against the live `production` branch, so it is a **human-run step after review**,
gated on the schema being merged to `main` — an agent never runs it.

