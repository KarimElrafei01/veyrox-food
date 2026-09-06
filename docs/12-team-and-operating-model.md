# Veyrox Food — Team & Operating Model

The build is solo. This document covers what that actually means: what I do, what I refuse to do myself, how the work is organized, and what the team looks like as revenue arrives.

---

## 1. The honest starting position

One engineer building a system that takes payments, moves money, holds customer personal data, and runs an unofficial automation that will get banned. That is a legitimate thing to do at pilot scale, and it fails in three predictable ways if it is not planned for:

1. **Operational debt compounds.** Every hour not spent on runbooks, alerts, and backups becomes three hours of firefighting later, and there is nobody to absorb it.
2. **The bus factor is 1.** Not a hypothetical — illness, travel, and bad weeks are certain, not possible.
3. **Blind spots ship.** No code review, no second opinion on a security decision, no one to say "an Egyptian café customer will not read that sentence."

The operating model below is built around those three, not around throughput. Throughput is the easy part.

---

## 2. What I own

Everything technical: architecture, backend, all five frontends, data model, infrastructure, CI/CD, observability, security, and release engineering. Plus the product work the PRD hands over — requirements, sprint planning, and the trade-off decisions recorded in the ADRs.

**Capacity assumption: ~55 productive hours per two-week sprint** on feature work, after support, ops, third-party integration friction, and the fact that some weeks are simply worse. This is deliberately conservative. Solo plans fail because they are calibrated on the best week.

Roughly how a normal sprint goes:

| Activity | Share |
|---|---|
| Feature implementation | 55% |
| Testing (written alongside, not after) | 15% |
| Ops, support, and the Wednesday block | 15% |
| Previous sprint's discovered work | 15% |

That last 15% is not padding. It is always consumed, and pretending otherwise just moves the miss into the following sprint.

---

## 3. What I contract out, and why

Each of these is something I *could* do badly. Doing them badly is worse than paying for them.

| Need | Why not me | Shape | When |
|---|---|---|---|
| **Egyptian-Arabic UX copy + RTL review** | I would write formal, stilted Arabic. A café customer reads that as a robot — which directly undermines the Habit Engine's entire premise of "a friendly nudge, not spam" (PRD §7). Register matters more than accuracy here | Freelance copywriter, ~2 weeks part-time | Before M1, again before M4 |
| **Legal — PDPL, ToS exposure, pilot agreement** | R1 and R2 are accepted *business* risks. They still need papering: controller/processor terms, R1/R2 disclosure to the café, liability, and the privacy notice | Egyptian tech/commercial lawyer, one engagement | Before M3 |
| **Visual design system** | I can build competent, accessible UI. I cannot build a brand, and a product sold to café owners on the strength of feeling modern needs one | Designer, ~3 weeks, **front-loaded before S1** so tokens and components exist before the first screen is built | Before S1 |
| **Independent security review (ASVS L2)** | My own threat model has my own blind spots by definition | One engagement | Before M5 |
| **Accessibility audit** | Same reason; automated `axe` catches maybe half of WCAG AA | One engagement | Before M5 |
| **Bookkeeping / e-invoicing advisory** | Egyptian e-invoicing requirements are specialist and change | Accountant, advisory retainer | When e-invoicing is scoped for v2 |

**The design engagement is front-loaded deliberately.** A design system delivered in month four means either rebuilding five SPAs or shipping a product that looks like a prototype. Delivered before Sprint 1, it costs nothing extra and every screen benefits.

---

## 4. Mitigating the bus factor

The uncomfortable part, addressed rather than ignored:

| Control | Detail |
|---|---|
| **Safe Mode** | One flag reduces the system to take-orders / show-tickets / record-payments. A café can run in Safe Mode unattended for days |
| **Break-glass access** | Sealed offline copy of recovery codes and root credentials, reachable by me and by one trusted person. Verified before GA |
| **Runbooks written for a stranger** | `08-operations-runbooks.md` assumes no context. Not written for me — written for whoever has to use it if I cannot |
| **Everything reproducible locally** | `pnpm dev` + `docker compose up`. No cloud-only glue, no GUI-configured workflow. This is a large part of why n8n was dropped (ADR-0004) — a successor cannot inherit a system whose scheduling logic lives in someone's browser |
| **ADRs** | Every material decision written down *with its reasoning*. The reasoning is the part that cannot be reverse-engineered from code |
| **Café expectations set honestly** | The pilot agreement states support hours and response times. An owner who knows I am one person is a partner; one who believes there is a support desk is a future complaint |

---

## 5. Cadence

| When | What |
|---|---|
| **Mon AM** | Sprint check: is the exit criterion still reachable? If not, cut now — the cut list exists so this decision is made calmly on a Monday, not desperately at 2am |
| **Daily** | At least one deploy to staging. Green `main` is a hard rule, not an aspiration |
| **Wed, 2h** | **Ops block**: tickets, error budget, invariant reports, dependency updates, one runbook rehearsed |
| **Fri PM** | Demo to myself against the sprint's exit criterion. Write down shipped-vs-planned; the delta is the velocity calibration for next sprint |
| **Sprint end** | One-page retro: what surprised me, what I would sequence differently, what moves to the cut list |
| **Monthly** | Backup restore drill result reviewed; cost review; security sweep; **a 30-minute non-incident call with the café owner** |

That last item earns its place. The monthly owner call — explicitly not about a bug — is where workflow friction surfaces: where the tablet actually sits, whether the barista can read the screen while the machine is steaming, what the cashier does when two people order at once. None of that is ever reported as a bug, and all of it determines whether the café is still using the product in month three (NR-7).

---

## 6. Hiring, as revenue allows

Order chosen by what each hire *unblocks*, not by what is most urgent to do.

### Hire 1 — Full-stack engineer *(target: after M5 / 3–5 paying cafés)*

**Unblocks: on-call.** This is the actual reason, more than throughput. A second person means the bus factor stops being 1, deploys stop being risky when I am unavailable, and code review exists for the first time.

Profile: strong TypeScript, comfortable across API and React, willing to own operational work. Arabic-speaking is a genuine advantage for support. Onboarding is `docs/` plus a week of pairing on the ledger and the state machine — the two places where a wrong change is expensive and non-obvious.

### Hire 2 — Customer success / onboarding *(target: 8–12 cafés)*

**Unblocks: growth.** The constraint between café #5 and #50 is not software. It is menu setup, recipe entry, real supplier costs (PRD R5, per café), staff training, and the first two weeks of hand-holding. Doing that myself caps growth at roughly one café a month and destroys engineering time.

Profile: Egyptian F&B background, comfortable in a kitchen, patient with non-technical owners. Not a technical hire.

### Hire 3 — Data / ML engineer *(when AI add-ons become a revenue line)*

**Unblocks: the differentiator.** PRD R3 is explicit that the Has-POS track has to win on analytics, not ordering. Forecasting quality is the product at that point, and it needs someone whose full attention is on it.

Profile: applied forecasting and experimentation, not deep learning research. The techniques here are statistical and the value is in getting them *right and explainable*, not in getting them fancy.

### Deliberately not hired early

**A dedicated QA engineer** — the correctness burden here is carried by property-based tests and production invariants, which the engineer writing the code must own. **A dedicated DevOps/SRE** — four containers and one database do not justify it; a second full-stack engineer who shares on-call is strictly better value. **A PM** — the PRD exists and I own the roadmap; a PM before there is a team to coordinate adds a handoff, not throughput.

---

## 7. If this were a FAANG-sized org instead

Recorded because it clarifies which practices here are *scale-dependent* and which are *always correct* — and because it is the counterfactual the brief invited.

The team would be roughly 18 people: three squads (Ordering, Ops Surfaces, Data/AI) of 4–5 engineers each, a platform/SRE pair, a security engineer at 50%, two designers, a PM, and a TPM. Delivery would gain formal design-review and privacy-review gates, a proper on-call rotation, and per-squad error budgets.

**What would genuinely improve:** parallel delivery (M6 in maybe 16 weeks rather than 32), real code review, a security specialist rather than an audit, and 24/7 on-call instead of one person's phone.

**What would get worse:** coordination overhead across three squads for a product with one database and six deployables; a strong pull toward premature service decomposition; and slower decisions on exactly the judgment calls that matter most here — the ledger design, the R1 containment posture, the decision to keep the numbers deterministic and give the LLM only the prose.

**What stays identical at any size:** the append-only ledger, the versioned reference data, the single write path, the production invariants, idempotency everywhere, expand/contract migrations, and tested restores. None of those are solo-team compromises. They are the same choices a well-run team of fifty would make, and the fact that they are *also* what makes the system operable by one person is not a coincidence — systems whose correctness is structural rather than procedural need fewer people to keep them correct.

The genuinely solo-specific compromises are narrower and worth naming: no code review, no 24/7 coverage, no security specialist on staff, a two-tier alert policy that would be three or four tiers with a rotation, and an explicit cut list that a larger team would not need because it could absorb the scope. Each is a real gap, each is mitigated rather than solved, and each is the first thing that improves with Hire 1.
