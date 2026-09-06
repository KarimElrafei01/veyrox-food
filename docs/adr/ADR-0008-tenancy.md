# ADR-0008 — Tenant-scoped schema and RLS from commit one

**Status**: Accepted · **Date**: 2026-09-05

## Context

PRD §4 makes multi-branch an explicit non-goal for v1, and §8.9 lists it as a P2 consideration. v1 sells to a single café. The pilot is one branch.

## Decision

**Every table carries `tenant_id uuid NOT NULL`, every index leads with it, every query filters on it, and RLS enforces it — from the first migration.** Even though v1 has exactly one tenant.

## Rationale

Retrofitting tenancy is one of the most expensive migrations there is. It touches every table, every index, every query, every API route, and every test fixture, and it must be done while production data exists and cannot be down. It is also the migration most likely to leave a gap, because a single forgotten `WHERE` clause is a cross-tenant data leak that nobody notices until two cafés compare notes.

Doing it up front costs, in practice:
- one extra column per table,
- one extra term in each index definition,
- a `tenantId` argument threaded through the data layer, which the type system enforces.

That is close to zero, and it is paid once at the start rather than as a high-risk migration later. This is the clearest example in this project of a small deliberate cost now against a large uncontrolled cost later.

Multi-branch is also not speculative: it is in the PRD's own roadmap, and the business model (§1) is explicitly about selling to many cafés. Every café is a tenant from café #2 onward, which arrives at M5 — well inside the horizon of this plan.

## Implementation

- `tenants` table; `tenant_id` foreign key everywhere.
- Our session module issues JWTs carrying `tenant_id` and `role`; the API opens each request transaction with `SET LOCAL app.tenant_id`, and RLS policies read `current_setting`. Since ADR-0002 no client touches Postgres, so RLS is defence in depth rather than the primary control.
- The API resolves the tenant from the auth realm (session token, device token, or owner JWT) and passes it explicitly. There is no ambient or implicit tenant.
- A **cross-tenant leak test suite** runs on every merge: tenant A's JWT must return zero rows from every one of tenant B's tables.

That test suite is the real deliverable of this ADR. RLS policies are easy to write and easy to get subtly wrong, and the only way to know they hold is to assert it continuously.

## Alternatives considered

**Single-tenant now, migrate later.** Rejected for the reasons above.

**Database-per-tenant.** Rejected. Strong isolation, but it multiplies migration, backup, monitoring, and connection management by the number of cafés — an unacceptable operational load for a solo operator, and unnecessary at this data volume.

**Schema-per-tenant.** Rejected for the same reason in milder form, plus awkward cross-tenant analytics for our own product metrics.

## Consequences

**Good**: multi-branch (PRD §8.9) becomes a feature rather than a migration. Two cafés are separated by the database, not only by application code. Onboarding café #2 with zero code changes is achievable, and it is the M5 gate.

**Bad**: a small amount of ceremony on every query, and RLS policies that must be maintained alongside API authorization. The duplication is deliberate defence in depth (threat T3), not an oversight.
