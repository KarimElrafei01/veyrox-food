# Veyrox Food — Security, Privacy & Compliance

Scope: one Egyptian café's customers, staff, money, and books. Small in volume, meaningful in sensitivity — this system holds phone numbers, purchase histories, and the financial record of a small business.

---

## 1. Threat model

| # | Threat | Realistic? | Control |
|---|---|---|---|
| T1 | **Staff void fraud** — take cash, void the order, pocket the difference | **Very** — the most common F&B theft pattern, and the PRD as written enables it | Manager PIN + reason code + immutable attribution + nightly anomaly detection (FR-4.6, FR-4.11) |
| T2 | **Price tampering** by a customer manipulating the webview | Likely to be attempted | Server-side re-pricing on every order placement; the request contract carries no price field at all (FR-2.14, `05-api...` §2) |
| T3 | **Cross-tenant data leak** once multi-branch ships | Serious when it happens | RLS on every table + API-layer scoping + a leak test suite on every merge (NFR-32) |
| T4 | ~~Payment webhook forgery~~ → **Order spam / no-show abuse**. With no prepayment, anyone with WhatsApp can make a café consume materials with no commitment | **Likely**, and it is a cost the café now carries | Kitchen-accept gate (FR-3.11), one open unpaid order per customer (FR-2.23), no-show step-down (FR-2.25), per-`wa_id` rate limits. See ADR-0010 |
| T5 | **Customer PII exposure** through logs, traces, or an export | The most likely *real* breach path | Redaction at emit; keyed phone hashes; no message bodies stored (NFR-35, NFR-40) |
| T6 | **Session token theft** from the webview URL or its tab-scoped restoration copy | Plausible (shared screens, chat forwarding, or XSS) | 15-minute TTL, `sessionStorage` only (no cross-tab persistence), single-tenant binding, no personal data in the token, no privileged action reachable with it; every restored token is API-verified |
| T7 | **Habit host compromise** — Chromium and an unofficial library on a VPS | Elevated, by construction | Full isolation: read-only role on one 4-column view, no write credential, separate host and secrets (`10-risk-containment.md`) |
| ~~T8~~ | ~~Supabase anon key leaked from an SPA bundle~~ | **Eliminated 2026-09-06** | Dropping the BaaS (ADR-0002) removed every client-side database credential. **No browser holds anything that can reach Postgres.** A whole threat class deleted rather than mitigated |
| T9 | **Insider / my own credentials** | Solo operator = single point of compromise | Hardware-key 2FA on every provider account, separate admin identity, `audit_log` on all privileged changes |
| T11 | **Platform Admin session compromise** — one stolen session reads every café's books and can change every price | Low likelihood, **fleet-wide impact** | Separate deployable and origin (ADR-0014); **mandatory WebAuthn, no password fallback**; 4-hour sessions; scoped platform roles; `reason` required on every mutation; no UI path to tenant deletion |
| T12 | **Impersonation misuse** — silent access to a café's data, or a void performed "as" the owner | Real, and the easiest thing here to build irresponsibly | Read-only default; write-mode escalation with mandatory reason and a 30-minute time-box; persistent banner; attributed as `platform_user`, never disguised; **visible in the tenant's own audit log**; **cannot void, refund, or change price, cost, or plan** |
| T13 | **Owner disables a safety control under pressure** — turns off manager-PIN-on-void during a rush and never turns it back on | Likely | Not in the owner-editable allowlist. Enforced by `setting_definitions.owner_editable`, not by omitting a UI control (FR-10.4) |
| T14 | **Configuration bypass** — an owner enables an unpaid add-on, or re-enables a Veyrox kill switch | Plausible via API, not UI | Three-layer resolution where Layer 1 and Layer 2 win over Layer 3, evaluated server-side; clients receive resolved state and never raw flags (ADR-0015) |
| T10 | **Denial of wallet** — automated order spam driving template costs and wasted materials | Plausible | Per-IP and per-`wa_id` rate limits, per-customer open-order caps, the accept gate, spend alerts (NFR-29, NFR-49) |

**T8's removal is worth noting rather than quietly deleting.** Under Supabase, the anon key shipped inside every SPA bundle and had to be assumed public — the security model was built around containing a credential we were knowingly handing out. Since ADR-0002 there is no client-side database credential of any kind: the browser talks only to `code/backend/api`, over its own auth realm. That is a threat *eliminated*, not mitigated, and it is the largest single security improvement in the whole redesign.

**The database credential now lives in exactly one place** — the API's environment. Which raises the stakes on T9 (my own credentials) and T11 (admin session compromise), both already covered by hardware-key 2FA.

---

## 2. Authentication and authorization

### Four realms, deliberately non-overlapping

| Realm | Mechanism | Lifetime | Can reach |
|---|---|---|---|
| **Customer** | HMAC-signed session token bound to `wa_id` + `tenant_id` + `menu_version` | 15 min | `/public/*` only |
| **Staff** | Device enrollment (long-lived device JWT in secure storage) + per-staff PIN → short-lived action token | Device: 90 days, re-attested weekly. Action token: 15 min | `/staff/*`, `/orders/*` |
| **Owner** | Email + password (**argon2id**), **TOTP required before GA** | Session, 12h | `/console/*` |
| **Platform admin** | **Mandatory WebAuthn hardware key, no password fallback** | 4h, no "remember me" | `/admin/*` |

**All four realms are ours** (ADR-0002). They share one session-issuing module, one argon2id/JWT primitive set, and one rate limiter. Three of the four were always going to be bespoke — a signed customer token, device+PIN, and WebAuthn are not things a BaaS provides — so buying a vendor for the fourth bought a week and cost the stickiest lock-in in the design.

The cost is that **we now own the security posture of our own auth**, which is a real responsibility rather than a rhetorical one. It is why the independent ASVS L2 review before M5 (NFR-26) matters more than it did, and why its scope must explicitly include the session, PIN, and WebAuthn flows.

**Why the platform realm demands a hardware key when the owner realm does not.** The Store Console is used daily by non-technical people on shared devices; it needs password recovery and long sessions, and imposing a hardware key on a café owner is not workable. The Admin console is used occasionally by one or two technical people and can read every café's books. Merging the two would force the weaker control set onto both, and a role-gated section behind a password is exactly the phishing target a solo operator cannot afford (T9, T11). Hence a separate deployable and a separate realm (ADR-0014).

**Platform roles exist from day one** — `platform_owner`, `platform_support`, `platform_engineer` — despite there being one person today, because retrofitting a role model onto a live admin surface means auditing every route while people are already using it. `platform_support` gets read-only impersonation and order-state repair but no flags, entitlements, or billing; `platform_engineer` gets health, jobs, rails, and flags but no impersonation and no billing.

**Why device + PIN rather than individual logins:** the tablet is shared and staff turnover is high. Individual logins on a shared device get shared, written on a sticky note, and stop being attribution. Device enrollment establishes *which terminal*; the PIN establishes *which person*, at the moment of the action that needs attributing. Voids, refunds, and price edits require a **manager** PIN.

PINs: 4–6 digits, argon2id with a per-tenant pepper, 5 attempts per device per 15 minutes, and rotation when staff leave (an owner-facing action, not a support request).

### Authorization is enforced twice

Once in the API (explicit checks per route) and once in the database (RLS, scoped by `SET LOCAL app.tenant_id` inside each request transaction).

**RLS's role changed with ADR-0002 and it is worth being precise.** It used to be load-bearing, because browsers reached Postgres directly through Realtime and PostgREST. Now no client touches the database at all, so RLS is **defence in depth**: it catches a query that forgets its `WHERE tenant_id`, a leaked connection string, and the day multi-branch makes two cafés' books share a table. That is a genuinely valuable second line — a forgotten tenant filter is a mistake one tired engineer makes on a Tuesday — so it stays, and the cross-tenant leak suite still runs on every merge.

---

## 3. Data protection

### Personal data inventory

| Data | Where | Sensitivity | Handling |
|---|---|---|---|
| Customer phone (E.164) | `customers.phone_e164` | High | **Never logged.** Lookups go through `phone_hash` |
| Phone hash | `customers.phone_hash`, `customer_suppressions`, `outbound_messages` | Medium | Keyed HMAC-SHA256; the key is a rotatable secret |
| Customer name | `customers.display_name` | Medium | Optional, customer-provided |
| Order history | `orders`, `order_items` | Medium | Retained 7 years for tax; detached from identity on erasure |
| Message content | **Not stored** | — | Only `template_key`, parameters, and a content hash |
| Staff PINs | `staff.pin_hash` | High | argon2id + pepper |
| Card data | **Does not exist in v1** | — | No payment provider (ADR-0010); the café's own terminal is outside our system |
| Supplier costs | `material_costs` | Commercially sensitive | Owner/manager RLS only |

### Redaction at emit, not at query

`packages/observability` installs a processor that strips phone-shaped strings, tokens, and message-body fields from every log, span, and error report **before they leave the process**. This is deliberately at emit time: a redaction applied at query time still means the raw data was written to a third-party service, retained under their policy, and included in their backups.

Enforced by a test that logs a synthetic record containing a phone number and asserts the emitted payload does not contain it.

---

## 4. Egypt PDPL (Law 151/2018)

| Obligation | How it is met |
|---|---|
| **Lawful basis** | Documented per purpose: order fulfilment = contract performance; habit/marketing messages = consent (`marketing_opt_in`) |
| **Consent** | Explicit, granular, revocable. Opt-out via `STOP` / `توقف`, honoured by **both rails**, permanently |
| **Data minimization** | Phone and optional name only. No email, no address, no birthday, no device fingerprint |
| **Purpose limitation** | The habit rail sees four columns of one view — a structural expression of minimization, not a policy promise |
| **Retention** | Scheduled purge job; raw webhook payloads at 30 days; customer records 24 months post-activity (`04-data-model.md` §14) |
| **Access & erasure** | `POST /console/dsr`; executed within 30 days; erasure anonymizes while preserving financial aggregates; covered by an integration test |
| **Suppressions survive erasure** | `customer_suppressions` is **never deleted** — deleting an opt-out would silently re-enable contact with someone who asked you to stop |
| **Cross-border transfer** | Primary storage in Frankfurt. Disclosed in the privacy notice and the pilot agreement |
| **Processor access is visible to the controller** | Every impersonation session and every platform action on a tenant appears in **that tenant's own audit log**, with who, when, why, and what changed. A café owner can see every time Veyrox looked at their customers' data. This is a PDPL-relevant transparency control as much as an ethical one, and it is the sort of thing that is trivially built now and impossible to reconstruct retroactively |
| **Breach notification** | Documented procedure, 72-hour target, owner notified in parallel since it is their customers |
| **Controller/processor** | The café is the controller for its customer data; Veyrox is the processor. **This must be papered in the pilot agreement** — it determines who notifies whom, and it is the kind of thing that is trivially handled up front and expensive to sort out during an incident |

A concise, plain-Arabic privacy notice is linked from the ordering webview and from the first bot greeting. Not a wall of legalese — a café customer will read three sentences and no more, so the three sentences have to be the true ones.

---

## 5. Payments and PCI

**Out of scope entirely.** v1 has **no payment provider** (ADR-0010). Every order is paid at the counter on collection, in cash or on the café's own standalone terminal — recorded as the `visa` label, which is a *reconciliation label*, never an integration. No PAN, no CVV, no track data, and no payment flow of any kind exists on our infrastructure.

What replaces PCI controls here is **attribution**: every `payments` row carries a staff actor and a device, there is exactly one payment per order (INV-6), and there is no code path that marks an order paid without a counter action. With no external ledger to reconcile against, the till reconciliation (FR-4.7) and the void controls (FR-4.6) are the *only* defences against cash going missing — which raises their importance rather than lowering it (threat T1).

**If online payment or a card-present terminal is ever added** (the deferred v2 design in ADR-0010, or PRD §8.9), **PCI scope changes materially** and this section must be rewritten before a line of that code is written. Flagged here so it is not discovered afterwards.

---

## 6. WhatsApp platform compliance

**Official rail** — fully compliant: opt-in for Marketing templates, templates submitted for review, the 24-hour customer-service window respected, business verification complete, Commerce Policy observed for the menu.

**Habit rail** — **knowingly violates WhatsApp's Terms of Service** (PRD R1, an explicit and accepted business decision). What that means, stated plainly so nobody rediscovers it later:

- The consequence is enforcement against **that number**, not a legal claim. Meta bans; there is no appeal path because the number was never an API customer.
- Containment is engineering (`10-risk-containment.md`), not compliance. There is no compliant way to do this on an unofficial rail.
- The decision, its rationale, and its date are recorded in ADR-0003, signed off by the founder.
- **The pilot café is told in writing** that this channel may be interrupted without notice. They are the ones whose customers would notice.
- Independently of the ToS position, the habit rail still honours consent, opt-out, frequency caps, and quiet hours — because those are PDPL obligations and basic decency, and neither is waived by the platform question.

---

## 7. Review-platform compliance (R2)

The gated flow ships as the PRD decided. What is added:

- Per-tenant flag; the compliant variant built and tested behind it (FR-6.5).
- **Immutable audit** of every rating, routing decision, and the flag state at send time (FR-6.7). An accepted risk that cannot be reconstructed is an unbounded risk.
- **Hard constraint: the recovery voucher is never in the same message as a public-review ask** (FR-6.6). Incentivized reviews are a materially worse violation than gating, and combining them turns a policy problem into a straightforward deceptive-practice problem. Enforced by template separation and a test.
- Written disclosure to the café that their Business Profile is what is exposed.
- RB-9 is the runbook for the day it materializes.

---

## 8. Egyptian e-invoicing / e-receipt — **v2**

The PRD names Wave 9/10 e-receipt compliance as a market wedge (§2) but scopes no work for it. **Decided 2026-09-06: deferred to v2.** Position:

- **v1 does not submit to the Tax Authority.** A substantial integration — device registration, certificates, a submission protocol — and no café is signed, let alone confirmed to be in an active wave.
- **v1 does make it a v2 integration rather than a v2 re-model.** Receipt records carry `tax_registration_number`, per-item tax codes, and a document UUID from day one (FR-9.8). Adding fields later means backfilling every historical receipt.
- Open question Q3 determines whether the pilot café is actually in an active wave. If it is, this moves from "forward-compatible" to "scoped work," and it should be discovered in week 9 rather than by a letter from the tax authority.

---

## 9. Secrets and access

| Secret | Location | Rotation |
|---|---|---|
| Database credentials (Neon) | Host env / Fly secrets | Quarterly |
| JWT signing key (all realms) | Host env / Fly secrets | Quarterly, with overlap window |
| Meta app secret + token | Fly secrets | Quarterly |
| Phone-hash HMAC key | Fly secrets | **Annually, with a documented rehash migration** |
| Staff PIN pepper | Fly secrets | On suspicion only (requires PIN reset) |
| Habit host credentials | Hetzner env | **Shares nothing with the main environment** |
| Claude API key | Fly secrets | Quarterly |

Rules: never in the repo; never in CI logs; `.env.example` carries names and no values; a pre-commit secret scanner; **hardware-key 2FA on every provider account.** For a solo operator, provider account takeover is the whole game — it is more consequential than any application vulnerability in this document.

**Break-glass**: a sealed, offline copy of recovery codes and root credentials, held somewhere I can reach and someone I trust can reach if I cannot. This is a real single-point-of-failure and pretending otherwise does not remove it.

---

## 10. Application security baseline

Target **OWASP ASVS Level 2**, independently reviewed before M5 (NFR-26).

- Input validation via Zod at every boundary — the schema *is* the validation, so there is no path where a route forgot to validate.
- Parameterized queries only (Drizzle); raw SQL exclusively for analytics, reviewed and never string-interpolated with user input.
- Strict CSP with no `unsafe-inline`; HSTS; `X-Content-Type-Options`; `Referrer-Policy: strict-origin-when-cross-origin`.
- CSRF is not applicable (bearer tokens, no cookie auth on the API).
- Rate limits per IP, per `wa_id`, per device.
- Dependencies: Dependabot, `npm audit` gating high/critical, base images pinned by digest and scanned.
- No user-supplied HTML rendered anywhere; item names and notes are text nodes.
- Errors return problem details with a `traceId` and never a stack trace.

---

## 11. Compliance calendar

| When | What |
|---|---|
| Before M3 (pilot) | Legal review of the pilot agreement: PDPL controller/processor terms, R1 and R2 disclosures, liability. Privacy notice published in Arabic |
| Before M4 | Confirm the habit number is registered to the operating entity, not a personal line (Q4) |
| Before M5 (GA) | Independent security review (ASVS L2) and accessibility audit; secret-rotation rehearsal; break-glass verification |
| Quarterly | Secret rotation; access review; dependency sweep |
| Annually | Phone-hash key rotation with rehash; threat-model review |
| On any incident touching personal data | 72-hour breach assessment; café notified in parallel |
