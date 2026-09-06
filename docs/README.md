# Veyrox Food — Engineering & Product Documentation

Everything needed to take `veyrox-food-prd.md` from a PRD to production-ready software.

**Context this doc set was written under** (decided 2026-09-05):
- **Team**: solo / near-solo build. Every decision optimizes for *one engineer sustaining this in production*, not for headcount throughput.
- **Risk stance**: R1 (whatsapp-web.js) and R2 (review gating) ship as the PRD specifies. They are contained by engineering, not re-litigated. See `10-risk-containment.md`.
- **Stack latitude**: full. Every material choice has an ADR.

## Reading order

| # | Document | Read it when |
|---|---|---|
| — | [00-master-plan.md](00-master-plan.md) | **Start here.** The spine: strategy, milestones, what "done" means. |
| 1 | [01-system-design.md](01-system-design.md) | You need the architecture, components, and data/control flow. |
| 2 | [02-functional-requirements.md](02-functional-requirements.md) | You are implementing a feature and need its exact behaviour. |
| 3 | [03-non-functional-requirements.md](03-non-functional-requirements.md) | You need latency/availability/security targets and their SLIs. |
| 4 | [04-data-model.md](04-data-model.md) | You are touching the schema. Read the ledger section before anything. |
| 5 | [05-api-and-integration-contracts.md](05-api-and-integration-contracts.md) | You are building an endpoint or a third-party integration. |
| 6 | [06-sprint-plan.md](06-sprint-plan.md) | You want to know what to build this week. |
| 7 | [07-test-and-quality-strategy.md](07-test-and-quality-strategy.md) | You are writing tests or setting a merge gate. |
| 8 | [08-operations-runbooks.md](08-operations-runbooks.md) | Something is on fire, or you are preparing for launch. |
| 9 | [09-security-privacy-compliance.md](09-security-privacy-compliance.md) | You are handling personal data, money, or a legal question. |
| 10 | [10-risk-containment.md](10-risk-containment.md) | You are touching the Habit Engine or Review Shield. |
| 11 | [11-prd-gap-analysis.md](11-prd-gap-analysis.md) | You want the list of things the PRD does not say but production requires. |
| 12 | [12-team-and-operating-model.md](12-team-and-operating-model.md) | You are planning capacity, hiring, or what to contract out. |
| 13 | [13-admin-and-configuration.md](13-admin-and-configuration.md) | You are building either console, or anything that reads a feature flag, entitlement, or setting. |
| 14 | [14-code-structure-and-conventions.md](14-code-structure-and-conventions.md) | You are writing any code at all. Folder layout, DDD boundaries, and the simplicity rules. |
| — | [features/](features/) | You are implementing a specific feature. Subfeature specs with exact API contracts, indexes, and caching. |
| — | [adr/](adr/) | You want to know *why* a technical decision was made. |

## Conventions used throughout

- **FR-x.y** = functional requirement. **NFR-x** = non-functional requirement. **ADR-nnnn** = architecture decision record. **G1..G5** = PRD goals. **R1..R6** = PRD risks. **GAP-nn** = gap found during planning.
- Configuration resolves through **three layers** — platform capability, tenant entitlement, tenant preference — in that order. Clients read *resolved state*, never raw flags. See ADR-0015.
- Money is **integer minor units (piastres, 1 EGP = 100)** in every interface. Costs are `NUMERIC(14,6)`. See ADR-0007.
- All times are stored UTC, displayed and scheduled in **`Africa/Cairo`**, which observes DST. See ADR-0004.
- "Tenant" = one café branch. v1 sells single-branch, but the schema is tenant-scoped from commit 1. See ADR-0008.
