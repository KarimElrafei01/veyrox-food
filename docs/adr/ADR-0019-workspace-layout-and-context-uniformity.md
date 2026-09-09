# ADR-0019 — Workspace layout: `docs/` + `code/`, one structured backend, uniform contexts

**Status**: Accepted · **Date**: 2026-09-09
**Amends** ADR-0001 (repository layout — the workspace root moves down one level) and
working rule 7 in `CLAUDE.md` / `AGENTS.md` (parallel work no longer uses `git worktree`).

## Context

The repo grew three sibling working directories on disk (`D:\Veyrox Food`,
`D:\veyrox-food-frontend`, `D:\veyrox-food-neon`) as `git worktree`s for parallel agent
sessions, plus four nested full-repo review copies. Working rule 7 (`CLAUDE.md` / `AGENTS.md`)
blessed the worktree pattern. It cost more than it bought: stale checkouts drifted,
uncommitted work was stranded in a directory nobody was looking at, and every search ran
against several copies of the tree.

Two things the owner asked for this session force a layout decision:

1. **The parent directory should hold `docs/` and `code/` as siblings** — the spec of record
   and the implementation are different kinds of thing and should not be interleaved at the
   repo root.
2. **One deployable backend, separated as hard as the language allows** — not four services
   (that was considered and rejected: it puts the material-ledger invariant across a network
   boundary, see below), but bounded contexts that cannot reach into each other by accident.

And a consistency decision that pairs with ADR-0018: **every bounded context carries the
same four layer folders**, the same way every frontend feature carries the same six.

## Decision

**1 — Git root is the parent. It contains `docs/` and `code/`.**

```
veyrox-food/                    # git root
├── docs/                       # spec of record (unchanged content)
└── code/                       # the pnpm + Turborepo workspace; .env lives here
    ├── backend/
    │   ├── api/                # @veyroxai/api    — Fastify, the single write/read path
    │   └── worker/             # @veyroxai/worker — BullMQ, same image, different entrypoint
    ├── frontends/
    │   ├── order/  kds/  till/  console/  admin/
    ├── packages/               # domain contracts db ui i18n api-client ops-core observability testkit
    └── infra/
```

Every workspace member stays exactly **two levels under `code/`** (`code/backend/api`,
`code/frontends/order`, `code/packages/ui`) — the same depth `apps/*` and `packages/*` had
under the old root. So `extends "../../tsconfig.base.json"`, `../../eslint.config.js`, and
`--env-file-if-exists=../../.env` keep resolving unchanged. Only `pnpm-workspace.yaml` globs,
a few root configs, and the Husky `core.hooksPath` change.

**2 — One backend, hard context boundaries.** `code/backend/api` is one Fastify process
(one image, `worker` is the same image with a different entrypoint — ADR-0001, ADR-0004).
Inside it, `src/contexts/<context>/` is a module whose only public surface is
`<context>/domain/index.ts` — its published events and public types. A lint zone
(`import/no-restricted-paths`) makes a file in `contexts/A/**` importing `contexts/B/**`
anything other than `contexts/B/domain/index` a build failure, not a review comment. This is
the existing "no cross-context imports" rule (`docs/14` §6) promoted from convention to
enforcement.

**3 — Every context carries all four layers.** `domain/`, `application/`, `infrastructure/`,
`interface/` exist in every context — `ordering` and `catalog` and `analytics` alike — each
with an `index.ts` that is that layer's public surface. Where a context has more than a
handful of files in a layer, they group by use case (`application/place-order/…`).

This **changes `docs/14` §2's "where DDD is deliberately NOT applied" table.** That table
said `catalog`/`platform`/`identity` are plain services with no domain layer and `analytics`
has none at all. The skeleton is now uniform. What is *inside* a layer still follows the
simplicity rules: a `catalog` `domain/` that only re-exports types is correct and stays that
way until an invariant needs it; `analytics` `domain/` may hold nothing but the read-model
types. **Uniform folders, not uniform ceremony** — an aggregate root still appears only where
you can name the invariant it protects.

**4 — No `git worktree` for parallel work.** Agents and humans work in the one checkout,
`D:\Veyrox Food`, coordinating on short-lived branches. Working rule 7's worktree sentence is
replaced.

## Alternatives considered

**Four backend services (one per product surface).** The owner's first instinct. Rejected
after walking it through: contexts do not map to surfaces — `inventory` serves ordering, the
Till and the Console; `identity` serves all four realms. Cutting per-surface backends either
duplicates those contexts or puts an RPC between `ordering` and `inventory`, which means the
"materials deduct exactly once, a void negates exactly those rows" invariant now spans a
network call and a distributed transaction. That is the single most expensive thing in the
system to get wrong. Phase-0 hosting (ADR-0011, one small VPS) also has no room for four
services. One process, hard internal walls, is the same separation without the failure mode.

**Keep the flat repo root, just move `docs/` out.** Rejected — half a rename. If `docs/` and
`code/` are siblings, the workspace root is `code/`, and `package.json` / `turbo.json` /
`pnpm-lock.yaml` belong next to the code they govern.

**Leave `docs/14` §2 as-is; scaffold new contexts to match the table (some with no domain
layer).** Rejected — it reintroduces the per-context judgement call ADR-0018 removed for
frontends. A contributor should not have to remember which contexts are "allowed" a domain
folder.

**Keep worktrees, add hygiene rules.** Rejected — the failure was stranded work in an
unwatched directory. A rule telling people to watch the directory does not fix that; one
checkout does.

## Consequences

**Good**: one working directory, no drift. `docs/` and `code/` are cleanly separable — the
spec can be read, linked, and published without the code. Context boundaries are enforced by
CI. New contexts and new SPAs have exactly one shape to scaffold into. The two-levels-deep
rule keeps the config churn of the move small.

**Bad**: a one-time move touching every workspace member's path and the lockfile, plus
`docs/14`, `CLAUDE.md`, `AGENTS.md` rewrites — estimated 2–4 days, displacing that much of
M0 (`docs/06-sprint-plan.md`). Empty-ish layer folders appear in CRUD contexts (a `catalog`
`domain/index.ts` that re-exports three types). The `code/` prefix is one more path segment
in every terminal command run from the repo root — mitigated by the workspace root being
`code/`, where `pnpm` is actually run.

## Reversal

The layout is `git mv` and a workspace-glob edit; flattening `code/` back to the root is the
same move in reverse. The context lint zone is one config block. The four-layer uniformity is
a scaffold convention — a context that never grows a real domain layer can have the folder
deleted locally without touching anything else.
