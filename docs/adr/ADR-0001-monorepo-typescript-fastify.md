# ADR-0001 — TypeScript monorepo, Node 22, Fastify

**Status**: Accepted · **Date**: 2026-09-05

## Context

Six deployables and several shared concerns (pricing, costing, ETA, loyalty, state machines) that must behave identically wherever they run. One engineer. The PRD sketches Node/Express.

## Decision

- **TypeScript 5.x, strict**, everywhere: API, workers, all five SPAs, shared packages.
- **Node 22 LTS.**
- **pnpm workspaces + Turborepo** monorepo.
- **Fastify** with `fastify-type-provider-zod`, not Express.
- A pure, dependency-free **`packages/domain`** holding every rule that decides a price, cost, quantity, tier, or transition.

## Alternatives considered

**Express** (the PRD sketch) — rejected. It provides no schema integration, so validation, TypeScript types, and API documentation become three separately-maintained artifacts that drift apart. Fastify with Zod produces all three from one declaration, which is what makes NFR-62 ("the OpenAPI document cannot drift from the implementation") mechanically true rather than a matter of discipline.

**Go or Rust for the API** — rejected. Faster, but this system is nowhere near CPU-bound (about 5 writes per second at peak), and a second language means the pricing logic either exists twice or sits behind an RPC. For a solo build the context-switch cost dominates a runtime benefit that does not exist here.

**Polyrepo** — rejected. The entire value of `packages/domain` is that the Till and the analytics job cannot disagree about what a recipe costs. Across repositories that requires publishing and version pinning, and version skew becomes possible again — which is precisely the failure being designed out.

**NestJS** — rejected. Substantial structure for a codebase this size. The DI and module ceremony would cost more than it organizes.

## Consequences

**Good**: one mental model; shared logic is genuinely shared; refactors are atomic across API and clients; schema-first means an endpoint cannot exist undocumented or unvalidated.

**Bad**: Node is single-threaded, so a CPU-heavy analytics query can block the event loop — mitigated by keeping heavy computation in Postgres and in workers, never in the request path. Monorepo CI needs care to stay inside the 5-minute budget; Turborepo caching covers it.

## Reversal

If the API ever becomes CPU-bound, `packages/domain` is pure and portable and the API is stateless behind one contract. Rewriting one service in another language is possible without touching the clients.
