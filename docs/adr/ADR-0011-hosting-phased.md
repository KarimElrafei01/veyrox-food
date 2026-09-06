# ADR-0011 — Phased hosting: near-zero now, migratable without re-architecture

**Status**: Accepted · **Date**: 2026-09-06
**Supersedes**: ADR-0011 (Fly.io + Cloudflare Pages + isolated Hetzner host), 2026-09-05.

## Context

Users are in Cairo. The system is six deployables plus one deliberately isolated worker. One engineer operates all of it. **There is no revenue and no signed pilot café**, so the constraint that actually binds right now is cost, not availability — and the original ADR jumped straight to the M5-shaped answer at $80–150/month.

## Decision

Three phases. Each is a superset of the last, and **no phase transition requires re-architecting anything.**

### Phase 0 — now through M2 · **~$4/month**

| Component | Where |
|---|---|
| Postgres | **Neon free tier** (ADR-0002) |
| `api` + `worker` + Redis | **One Hetzner CX22**, Docker Compose |
| `order`, `ops`, `console`, `admin` | **Cloudflare Pages** |
| Object storage | **Cloudflare R2** free tier |
| Observability | Grafana Cloud free + Sentry free |

Oracle Cloud Always Free ARM reaches literally $0 if wanted, at the cost of less predictable capacity availability.

### Phase 1 — M3, first real café · **~$30–40/month**

Neon paid tier for **PITR** (the hard gate — see below). API and worker move to **Fly.io `fra`**, two machines, for health-checked rolling deploys and 3-minute image rollback. Redis moves to managed (Upstash).

### Phase 2 — M5, GA · **~$80–150/month**

The original target: Fly HA pair, managed Redis, paid observability if the free tiers are outgrown.

### Throughout — the habit rail is never co-located

From Sprint 10, `habit-worker` gets **its own box, its own provider, its own egress IP** (~€4/month). This is R1 containment, not a cost decision. It is never folded onto the main VPS at any phase.

## Why the phases migrate cleanly

This is the entire justification for starting cheap, so it is worth being concrete:

- **Neon free → paid is a billing toggle.** Same connection string, same database. Not a migration.
- **VPS → Fly.io is `fly deploy` against the Dockerfile that already exists.** The API is stateless (T3); there is nothing to port.
- **On-box Redis → Upstash is a connection string**, and every job is idempotent and re-derivable from database state (NFR-24), so even a lossy cutover is safe.
- **Cloudflare Pages and R2 do not change at all.**

## Reversing the original "no single VPS" rejection

The superseded ADR rejected one box running everything on four grounds. One has evaporated; three are accepted with an expiry date:

| Original objection | Status |
|---|---|
| "It would put the untrusted habit Chromium next to payment credentials" | **Gone.** There are no payment credentials (ADR-0010), and the habit worker is never co-located regardless |
| "No health-checked rollback; single point of failure for the ordering path" | **Still true, accepted only because there is no café.** This is exactly what Phase 1 buys, gated on a real café existing |
| "Manual patching" | Still true. Unattended-upgrades plus a monthly patch slot in the Wednesday ops block |
| "No rolling deploys" | Still true. Brief downtime on deploy is fine with zero users |

## What Phase 0 knowingly does not meet

Stated explicitly so it cannot be quietly forgotten — these are NFR violations with an expiry date:

| Not met in Phase 0 | Restore by |
|---|---|
| **NFR-20 — RPO ≤5 min.** Neon free gives point-in-time restore over a short window only | **M3, hard launch gate** |
| **NFR-21 / NFR-54 — rehearsed 1h RTO, 3-minute rollback** | M3 |
| **NFR-1 — 99.5% ordering availability.** One box, no HA | M3 |
| Per-PR preview environments | **Available immediately** via Neon branching — the one thing Phase 0 does *better* than the original design |

**The M3 gate now includes "hosting is on Phase 1."** A real café's data does not live on a single unbacked box.

## Why Frankfurt, still

Cairo to Frankfurt is 60–80ms, comfortably inside every latency target (NFR-5: p95 300ms). A closer region would save ~30ms of a 300ms budget while thinning provider options. The real latency work is elsewhere: static assets on Cloudflare's edge, and the offline-first Ops app removing the network from the critical path entirely.

## One constraint the SSE decision imposes

ADR-0005 means the API holds **long-lived connections**, so it cannot scale to zero. That rules out serverless-style hosting for `api` at every phase, and is part of why a small always-on VPS is the right Phase 0 shape rather than a function platform.

## Consequences

**Good**: ~$4/month until there is something worth protecting; preview environments from day one; every phase transition is a config change rather than a project; the habit rail stays physically isolated throughout.

**Bad**: Phase 0 has no HA and misses three NFRs. Acceptable **only** while there are no users. The real risk is drifting into a pilot on Phase 0 infrastructure — which is why the restoration is written into the M3 gate rather than left to judgement.
