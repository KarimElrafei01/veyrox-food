# ADR-0014 — Platform Admin as a separate deployable with its own auth realm

**Status**: Accepted · **Date**: 2026-09-05

## Context

Veyrox needs a surface to operate the fleet: provision tenants, grant entitlements, flip kill switches, control the messaging rails, support cafés, and run compliance operations (`13-admin-and-configuration.md` §5). The obvious cheap option is a hidden section inside the existing Store Console, gated by a role.

## Decision

**A fifth deployable, `apps/admin`**, with:

- its own **auth realm** — **mandatory WebAuthn hardware key, no password fallback**, 4-hour sessions, no "remember me";
- its own **route namespace** (`/admin/*`) on the same API, with platform-role authorization and `reason` as a required field on every mutation;
- **platform roles** (`platform_owner`, `platform_support`, `platform_engineer`) from day one, despite there being one person today;
- **no UI path to tenant deletion** — CLI only, with a 7-day soft-delete window;
- a **CLI equivalent for every mutating action**, sharing the same domain functions.

## Rationale

**Blast radius.** This is the only surface that reads every café's books, changes every price, and disables every safety control. A cross-site scripting bug, a leaked bundle, or a stolen session on the Store Console is a single-tenant incident. The same on the Admin console is a fleet incident. Separating the deployable means the admin code, its dependencies, and its origin are not shipped to every café owner's browser, and a compromise of one does not imply the other.

**Different threat model, different controls.** The Store Console is used daily by non-technical people on shared devices, so it needs password recovery and long sessions. The Admin console is used occasionally by one or two technical people, so it can demand a hardware key and a short session. Merging them forces the weaker set of controls onto both — you cannot require a hardware key of a café owner, and having a role-gated section behind a password is precisely the phishing target a solo operator cannot afford (`09-security-privacy-compliance.md` T9).

**Roles exist before the team does** because retrofitting a role model onto a live admin surface means auditing every route and every screen while people are already using it. The cost now is a column and a middleware check.

**The CLI rule is an availability decision, not a convenience.** The admin console is the mechanism for flipping `safe_mode` and freezing the habit rail. If the only path to a kill switch is a web app, and the incident is a bad deploy that broke the web app, the recovery mechanism has failed with the thing it was meant to recover. Every action therefore has a second path that shares the same domain logic, so the two cannot diverge.

## Alternatives considered

**A role-gated section of the Store Console.** Rejected — one bundle, one origin, one session model shared between the least and most privileged users in the system. It also makes accidental exposure a UI bug rather than an impossibility.

**A separate app on a separate domain with its own API.** Rejected — duplicating the API means duplicating the domain logic that enforces the invariants, which is the thing this architecture most wants to keep singular. Route-level separation on one API, with a distinct auth realm, gets the isolation that matters without splitting the correctness core.

**Direct database access and SQL for platform operations, no console at all.** This is the status quo the plan implicitly assumed, and it is what the pilot would otherwise run on. Rejected: running SQL against production during an incident is how data gets damaged (see RB-3, whose first instruction is *snapshot first, do not fix yet* — a rule that is hard to follow with a `psql` prompt open). It also does not scale past one café, and it cannot be delegated to Hire 2.

## Consequences

**Good**: a fleet-wide compromise requires defeating a hardware key; the admin surface can adopt stricter controls without degrading the café experience; support and engineering can be scoped separately when hired; platform actions are auditable by construction because `reason` is in the schema.

**Bad**: a fifth deployable to build, deploy, and maintain, and a fourth auth realm to test. Mitigated by sharing the API, the domain package, the UI package, and the CI pipeline — the incremental surface is the SPA and its authorization middleware, not a new stack.
