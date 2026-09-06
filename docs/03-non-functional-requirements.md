# Veyrox Food — Non-Functional Requirements

Every NFR below has a **measurable SLI**, a **target**, and **how it is watched**. An NFR with no meter is an aspiration; those are excluded.

**Scale context, stated up front so nothing here is over-engineered:** one pilot café at ~300 orders/day with a ~40-order peak hour; 50 cafés by month 9 is ~15,000 orders/day, roughly **0.2 writes/second average and under 5/second at peak**. This system is not throughput-constrained. It is constrained by *correctness*, *availability during a 20-minute rush*, and *being operable by one person*. The targets reflect that.

---

## 1. Availability

| ID | Requirement | SLI | Target | Watched by |
|---|---|---|---|---|
| NFR-1 | **Ordering path** (webhook → order created → KDS visible) available during café hours | Successful order-creation ratio, 07:00–01:00 Cairo | **99.5%/month** (≈2.2h error budget in-hours) | Synthetic order every 5 min from an external prober; **pages** on 3 consecutive failures |
| NFR-2 | **Till** usable during café hours | Ratio of Till sessions with no unrecoverable error | 99.9% | Client-reported, Sentry; ticket |
| NFR-3 | **Console** available | Uptime | 99.0% | Prober; ticket |
| NFR-4 | **Till functions with zero connectivity** | Orders creatable and sendable-to-kitchen while offline | 100% | Automated offline E2E on every merge |

**Deliberate asymmetry.** The Till has a *higher* availability requirement than the API, because it is the surface that must survive the API being down. The console has a *lower* one, because an owner checking margins at 23:00 can wait; a customer at the counter cannot.

**Error-budget policy (solo edition):** if the NFR-1 budget is more than half consumed at mid-month, the next sprint starts with reliability work before features. No committee, no debate — it is a rule I wrote for myself while calm.

---

## 2. Latency

| ID | Path | SLI | Target |
|---|---|---|---|
| NFR-5 | API mutating endpoints | p95 / p99 server time | **300ms / 800ms** |
| NFR-6 | API read endpoints | p95 | 200ms |
| NFR-7 | **KDS status propagation** | p95 from commit to render on another client | **<1s** (PRD §8.3 acceptance) |
| NFR-8 | Webhook acknowledgement to Meta | p99 | **<500ms** (work is enqueued, never done inline) |
| NFR-9 | Customer webview first meaningful paint, cold, on 4G mid-range Android | p75 | **<2.0s** |
| NFR-10 | Customer webview time-to-interactive, cold | p75 | **<2.5s** |
| NFR-11 | Till "add item to cart" | p95 local, no network | **<100ms** |

NFR-9/10 are the ones that will actually be hard. They are met by a hard budget, not by optimism:

| Budget | Limit |
|---|---|
| Initial JS (gzipped) | **≤150 KB** |
| Initial CSS | ≤20 KB |
| Fonts | ≤1 subset woff2, `font-display: swap`, Arabic + Latin subset only |
| Images | AVIF/WebP, lazy below the fold, explicit dimensions |
| Third-party scripts on the ordering path | **zero** |

Enforced in CI by `size-limit` as a **failing** check, and by a Lighthouse CI run on the preview deploy with a mid-tier mobile throttling profile. A budget that only warns is a budget that is always exceeded.

---

## 3. ETA quality — a first-class NFR

| ID | Requirement | SLI | Target |
|---|---|---|---|
| NFR-12 | The promised ETA range is honest | `p90(actual_ready_at − promised_upper_at)` | within **±5 minutes**; alert if the promise is missed *or* beaten by more than that at p90 |
| NFR-13 | ETA does not systematically drift | 7-day rolling mean signed error | within ±2 minutes |

Beating the promise badly matters as much as missing it: a system that says 12 minutes and delivers in 4 is teaching customers to ignore it, and PRD §8.2's whole point is that the customer can *decide whether to wait*. Without NFR-12, ETA quality degrades invisibly.

---

## 4. Correctness and data integrity

| ID | Requirement | SLI | Target |
|---|---|---|---|
| NFR-14 | **Ledger invariant INV-1**: every voided order's material deltas net to zero | Violations detected | **0, always.** Any violation **pages** |
| NFR-15 | INV-2..INV-7 (see `01-system-design.md` §9) | Violations | 0; pages |
| NFR-16 | One payment per order, always attributed | Orders with >1 `payments` row, or any payment lacking a staff actor | 0 |
| NFR-17 | No lost or duplicated order across an offline/online transition | Duplicate-or-missing rate in the offline E2E suite | 0 |
| NFR-18 | Money arithmetic is exact | Float usage in money paths | **0** — enforced by a lint rule banning `number` in money types and a `Minor` branded type |
| NFR-19 | Historical reports are stable | A report for a past date, re-run after a price/recipe/cost edit **made through the Store Console**, is byte-identical | 100%; regression test on every merge |
| NFR-19a | Feature resolution is deterministic and explainable | Every resolved feature state carries a reason (`platform_disabled` \| `not_entitled` \| `owner_disabled`); no path returns "enabled" without an entitlement | Property test over all layer combinations |
| NFR-19b | Menu publishing is atomic | No customer session ever observes a partially-published menu revision | Integration test publishing under concurrent quote requests |

NFR-19 is the measurable form of the "immutable history" thesis. It is the test that catches anyone who "simplifies" a snapshot column away.

---

## 5. Durability and recovery

| ID | Requirement | Target |
|---|---|---|
| NFR-20 | **RPO** (max data loss) | **≤5 minutes** — Postgres PITR |
| NFR-21 | **RTO** (time to restore service) | **≤1 hour**, rehearsed |
| NFR-22 | Backups verified by restore | **Monthly automated restore to a scratch database, followed by a full invariant run.** Failure **pages**. A backup never restored is not a backup |
| NFR-23 | Append-only tables are physically protected | `REVOKE UPDATE, DELETE` from the app role **plus** a raising trigger — two independent mechanisms |
| NFR-24 | Redis loss cannot lose committed work | Persistent Redis; jobs are re-derivable from database state; every job is idempotent |
| NFR-25 | Migrations are reversible in practice | Expand/contract only; the previous image must run against the new schema. Rollback = redeploy previous image |

---

## 6. Security

| ID | Requirement |
|---|---|
| NFR-26 | Baseline **OWASP ASVS Level 2**, verified by an independent review before M5 |
| NFR-27 | TLS 1.2+ everywhere; HSTS; secure cookies; strict CSP with no `unsafe-inline` on all five SPAs |
| NFR-28 | All webhook endpoints verify provider signatures (`X-Hub-Signature-256` for Meta) **before** parsing the body, and reject on failure without leaking timing |
| NFR-29 | Rate limits: per-IP and per-`wa_id` on public endpoints; 5 PIN attempts per device per 15 min; global limits on order creation per customer per hour |
| NFR-30 | **PCI: out of scope entirely.** v1 has no payment provider and no card flow (ADR-0010). The Till's `visa` label records a transaction taken on the café's own standalone terminal, which we never touch. If online payment or a card-present terminal is ever added, PCI scope changes materially and this must be revisited **before** that code is written |
| NFR-31 | Secrets never in the repo; rotation runbook exists and is rehearsed once before GA. **The habit environment shares no secret with the main environment** |
| NFR-32 | Authorization is enforced twice: in the API and by RLS. A cross-tenant leak test suite runs on every merge |
| NFR-33 | Dependencies scanned (Dependabot + `npm audit` gate on high/critical); container images scanned; base images pinned by digest |
| NFR-34 | Server-side price recomputation on every checkout; a client-supplied price is never trusted (FR-2.14) |

---

## 7. Privacy — Egypt PDPL (Law 151/2018)

| ID | Requirement |
|---|---|
| NFR-35 | Phone numbers are personal data. Stored E.164, indexed by keyed hash, **never written to logs, traces, or error reports.** `packages/observability` redacts phone-shaped strings, tokens, and message bodies **at emit time**, not at query time |
| NFR-36 | Lawful basis is documented per processing purpose: order fulfilment (contract) vs. marketing/habit messages (consent) |
| NFR-37 | `marketing_opt_in` is explicit and revocable; `customer_suppressions` is honoured by **both rails** and is **never deleted**, even when the customer record is erased |
| NFR-38 | Data-subject access and erasure are executable by the owner within 30 days; erasure anonymizes the customer while preserving financial aggregates. Exercised by an integration test |
| NFR-39 | Retention schedule enforced by a nightly job (see `04-data-model.md` §14); raw webhook payloads purged at 30 days |
| NFR-40 | Message bodies are not stored — only `template_key`, parameters, and a content hash |
| NFR-41 | Data residency: primary storage in the EU (Frankfurt). Cross-border transfer disclosed in the privacy notice and the pilot agreement |

---

## 8. Accessibility, localization, and device reality

| ID | Requirement |
|---|---|
| NFR-42 | **WCAG 2.2 AA** on the customer webview and the console. Audited independently before M5 |
| NFR-43 | Full **English (`en`, default) and Arabic (`ar-EG`)** support with correct RTL layout, icon mirroring, and bidi-safe number and currency formatting. No hardcoded strings anywhere; CI fails on a literal in a rendered component |
| NFR-44 | KDS and Till are usable at arm's length: ≥18px body, ≥28px item names, ≥44×44px touch targets, contrast ≥4.5:1, and **legible in direct sunlight** (tested on the actual pilot tablets, not a desktop browser) |
| NFR-45 | Customer webview supported on Chrome/Safari from the last 3 years, inside WhatsApp's in-app browser on both platforms — **which is the real test environment and behaves differently from a normal browser** |
| NFR-46 | Ops SPA target device: a ~$150 Android tablet. Performance is measured there, not on a laptop |

NFR-45 deserves emphasis: WhatsApp's in-app browser has its own quirks around storage, back-navigation, and payment redirects. Every ordering-path change is verified inside it before merge, because "works in Chrome" has repeatedly meant nothing here.

---

## 9. Cost

| ID | Requirement | Target |
|---|---|---|
| NFR-47 | Fixed infrastructure, phased (ADR-0011) | **Phase 0 ~$4/mo** (Neon free + 1 Hetzner CX22 + Cloudflare Pages/R2 + free observability) → **Phase 1 ~$30–40** at M3 (Neon paid for PITR, Fly ×2, managed Redis) → **Phase 2 $80–150** at GA. Habit rail is always a separate ~€4/mo box |
| NFR-48 | Marginal cost per order | **≈0 on messages** — Fiwano is flat per café (~$12–19/mo, ADR-0016), not per message; Meta bills only business-initiated templates.** No PSP percentage in v1 (ADR-0010); WhatsApp is free inside the 24h window. This materially improves unit economics for a product sold to thin-margin informal operators |
| NFR-49 | Template-message spend is tracked per tenant and alerted | Alert if a tenant's monthly template spend exceeds 2× the trailing median |
| NFR-50 | LLM spend for AI add-ons is capped per tenant per month, with a hard cutoff that degrades to the deterministic table rather than overspending | Cap enforced in code |

NFR-49 exists because of PRD R6: if the digest template is reclassified from Utility to Marketing, the cost change should show up as an alert within a day, not as a surprise on a monthly invoice.

---

## 10. Operability

| ID | Requirement |
|---|---|
| NFR-51 | **Two alert tiers only.** *Page*: ordering path down, payments failing, invariant violated, data-loss risk, backup restore failed. *Ticket*: everything else. An alert that is neither is deleted |
| NFR-52 | Every page-level alert has a runbook linked from the alert itself |
| NFR-53 | Mean time to diagnose from the *Café Health* dashboard plus one trace: **<10 minutes**. If an incident cannot be diagnosed that way, the instrumentation is the bug and fixing it is part of the incident |
| NFR-54 | Deploy to production takes **<10 minutes** and rollback **<3 minutes**, both rehearsed |
| NFR-55 | Every background job is idempotent, records a `job_runs` row, and has a manual CLI entrypoint |
| NFR-56 | Local reproduction of the entire system: `pnpm dev` + `docker compose up` (Postgres + Redis). No vendor CLI. No cloud-only glue, no GUI-configured workflow that cannot be run on a laptop (this is why n8n was dropped — ADR-0004) |
| NFR-57 | Feature flags propagate in ≤30s and are flippable from a phone |
| NFR-57a | **Every mutating Platform Admin action has a CLI equivalent** sharing the same domain functions. The console is the mechanism for flipping `safe_mode`; a kill switch reachable only through a web app has failed the moment the incident is a bad deploy that broke the web app |
| NFR-57b | Kill switches (`safe_mode`, `review_gating`, `habit_engine`, `whatsapp_ordering`) take effect fleet-wide in **≤60 seconds** and cannot be overridden by any tenant-level setting |
| NFR-57c | Tenant provisioning — tenant, owner user, number mapping, default flags and entitlements, seeded library — completes in **one action, with no SQL and no deploy**. This is the M5 gate expressed as a measurable requirement |

---

## 11. Maintainability

| ID | Requirement |
|---|---|
| NFR-58 | `packages/domain` is pure: no I/O, no ambient clock, no randomness. Coverage gate **90% line / 100% branch** |
| NFR-59 | Overall test suite runs in **<5 minutes** on CI. A slow suite is a suite that gets skipped, and a solo dev has no one to catch what they skipped |
| NFR-60 | TypeScript `strict` everywhere; `any` requires an inline justification comment; money uses a branded `Minor` type that cannot be accidentally added to a plain number |
| NFR-61 | One ADR per material decision, in `docs/adr/`, written **before** the code |
| NFR-62 | API is OpenAPI-documented, generated from the Zod schemas so it cannot drift from the implementation |

---

## 12. Scalability — what is deliberately *not* built

Stated explicitly so a future reader does not mistake absence for oversight:

| Not built | Why | When it would change |
|---|---|---|
| Horizontal DB scaling / sharding | 15,000 orders/day is ~5 writes/sec at peak on a database sized for thousands | >500 cafés, or a single café doing >5,000 orders/day |
| Read replicas | Matviews on the primary are far cheaper than the operational cost of replica lag | When analytics queries measurably affect transactional p95 |
| Message broker (Kafka etc.) | BullMQ on Redis handles four orders of magnitude more than this | Never, at any plausible size for this product |
| Multi-region | Egypt → Frankfurt is 60–80ms; a second region adds consistency problems for no user-visible gain | Expansion outside MENA |
| Kubernetes | Four containers | A team large enough that per-service deploy autonomy matters |

**The migration path is preserved regardless**: tenant-scoped schema, stateless API, idempotent jobs, and a single write path mean each of the above is an additive change rather than a rewrite. That is the actual scalability requirement — *not being blocked later* — and it is satisfied by the architecture rather than by premature infrastructure.
