# Veyrox Food — Risk Containment

## 1. The containment question

The PRD accepts two risks by explicit decision (§9, R1 and R2). This document does not reopen either. It answers the only remaining engineering question:

> **When this goes wrong — and R1 will — what else goes down with it, and how fast can we reverse it?**

The target for both: **blast radius of one component, reversal in minutes, and a complete audit trail of what we did while the risk was live.**

---

## 2. R1 — whatsapp-web.js *(High impact, accepted)*

> *"Meta actively detects and bans numbers running unofficial automation, with no appeal path. A ban takes down only the Habit Engine's number if isolated on its own dedicated line — but if the same number is ever reused for ordering, the whole customer channel goes down with it."* — PRD §9, R1

The PRD's own R1-mitigation (a dedicated isolated number) is marked *"Recommended, not yet implemented."* It is implemented here, and extended: a separate number is necessary but nowhere near sufficient, because the number is only one of several ways two rails can be linked or a compromise can spread.

### 2.1 Five isolation layers

| Layer | Control | What it prevents |
|---|---|---|
| **Number** | **The café's own second line** — dedicated to the Habit Engine, never used for ordering, never printed on the QR. Provisioned and owned by the café, treated as replaceable *(decided 2026-09-06, Q4)* | The PRD's stated cascade: ban takes the ordering channel with it |
| **Infrastructure** | Separate host (Hetzner CX22), separate provider from the main stack, **separate egress IP**, separate project and billing | Correlation between the automated number and our API traffic; a compromised Chromium reaching the main network |
| **Credentials** | The habit worker holds **no credential that can write anything**. Its database role (`habit_reader`) has `SELECT` on one view and no other grant anywhere. No Meta token, no service role, no secret shared with the main environment | A compromised host becoming a data breach or a write path |
| **Data** | `vw_habit_targets` exposes exactly four columns: phone, first name, usual item, discount code. No order history, no totals, no other customer | The host being a copy of the customer database |
| **Control** | Outcomes are reported back through one mTLS endpoint accepting outcome rows only, keyed by **phone hash rather than phone number** | The boundary carrying more personal data than it must, in either direction |

```
  MAIN                                        HABIT (isolated)
  ────                                        ────────────────
  VPS → Fly · Neon · Meta                     Hetzner CX22
  role: veyroxai_app (full)                     role: habit_reader
                                              └─ SELECT on vw_habit_targets
                                                 ...and nothing else, anywhere
       ▲                                                │
       └── POST /internal/habit/report (mTLS) ──────────┘
           outcome rows only, phone hashes only
```

**The habit host is cattle.** Terraform + cloud-init rebuild it in under 30 minutes, with a documented number re-pairing procedure. Nothing of value lives on it; the session state on its volume is expected to be lost.

### 2.1a Consequences of the number being the café's *(Q4, 2026-09-06)*

Choosing a café-owned second line over a Veyrox-owned one is the better product call — the nudge arrives from a number the customer recognises, which should lift the G5 reply rate and avoids a stranger's number messaging them at 08:15. It carries two costs that are now tracked rather than discovered:

**One session per café, and that does not scale linearly.** Each café's number needs its own authenticated whatsapp-web.js session, which means its own Chromium instance holding its own state. Ten cafés is ten browsers on the habit host; fifty is not a CX22. Practical consequences: the host is sized per-café from S10 onward, sessions are supervised individually so one crash does not take the others down, and **the migration trigger to the official Cloud API rail (ADR-0003) is now partly economic, not only risk-driven** — at some café count, running N Chromium sessions costs more than N sets of template fees. That crossover should be computed with real numbers at M4, not guessed now.

**The ban lands on the café's asset, not ours.** Previously a ban cost us a disposable SIM. Now it costs the café a number they provisioned, and possibly one they have given to customers. That makes the R1 disclosure in the pilot agreement **required rather than courteous** — the café must understand, in writing and before signing, that this specific number may be banned without warning or appeal, and that replacing it is a routine part of the arrangement. It also raises the value of the conservative send controls in §2.2: they now protect someone else's property.

**What does not change**: the ordering number is still never used for automation, the host is still isolated with its own egress, and the `habit_reader` role still sees four columns of one view.

### 2.2 Send behaviour designed to reduce ban probability

Not compliance — there is no compliant way to do this — but a genuine reduction in detection surface, and independently the right thing for the customer:

| Control | Value | Why |
|---|---|---|
| Global daily cap | 100 sends/tenant/day | Volume is the strongest detection signal |
| Per-hour rate limit | ≤20/hour | Bursts look automated |
| Inter-message jitter | Randomized 20–90s | Fixed cadence is a fingerprint |
| Send window | 08:00–21:00 Cairo, hard stop | Night sending draws complaints, and complaints draw enforcement |
| Per-customer cooldown | 7 days (PRD §8.7 P0), asserted by INV-5 | Anti-spam; the PRD's own requirement, made structural |
| Opt-out | `STOP` / `توقف` → permanent suppression, honoured by **both rails** | PDPL, and complaints are a primary ban trigger |
| Content variation | Templated with rotating phrasing | Identical repeated strings are trivially detectable |
| Warm-up | New numbers ramp from 10/day over two weeks | A brand-new number sending 100 messages on day one is the classic ban pattern |

The most effective ban-avoidance control in this table is the opt-out. Bans follow user reports far more reliably than they follow traffic analysis, and a customer who can stop the messages does not report the number.

### 2.3 Detection and the freeze-not-reconnect rule

A health probe runs every 5 minutes: session state, a self-directed test message weekly, and heartbeat age.

**On auth failure or disconnect, the worker freezes and alerts. It does not reconnect.** This is counter-intuitive and it is deliberate: an automatic reconnect loop against a flagged session is itself a strong enforcement signal and reduces the odds that the number is recoverable. A human decides what happens next (RB-8).

### 2.4 The escape hatch — built before it is needed

```ts
interface HabitChannel {
  send(target: HabitTarget, message: RenderedMessage): Promise<SendOutcome>;
  healthCheck(): Promise<ChannelHealth>;
}
// Two implementations, both complete, both tested:
//   WwebjsChannel        — the accepted-risk rail
//   CloudApiChannel      — official templates, per-message cost
```

**Before M4 ships, the Cloud API templates for both habit rules are submitted to Meta, approved, and sitting unused.** This is the single most important line in this document. Template approval takes days to weeks; discovering that after a ban means retention is dead for a fortnight. Discovering it *before* means a ban costs a flag flip and a per-message fee.

Migration on ban: flip `habit.channel = cloud_api`, verify sends, done. **Minutes, not weeks.** The remaining cost is real (per-message fees, an opt-in requirement, and Meta's cap of roughly two marketing templates per user per day across all businesses — precisely the friction the PRD chose to avoid), but the product does not go dark while that is negotiated.

### 2.5 The ban log

Every ban is recorded: date, number, message volume over the preceding 7 days, content changes, and anything else that shifted. Over time this is the **only real evidence** about what actually triggers enforcement — everything published on the subject is anecdote. After the second ban in 90 days, the economics have spoken and PRD §8.9's migration item gets scheduled rather than re-debated.

### 2.6 What is deliberately *not* done

- **No attempt to evade detection** beyond conservative sending. Proxy rotation, device spoofing, and fingerprint manipulation escalate a terms violation into something with a different character, raise the stakes if it is noticed, and buy little.
- **The ordering number is never, under any circumstance, used for automation.** This is the one line whose crossing turns a contained risk into the outage the PRD explicitly warns about. Enforced by a database CHECK constraint on `habit_rules.channel` and by the two rails not sharing a credential store.

---

## 3. R2 — Review gating *(Medium impact, accepted)*

> *"Google's April 2026 policy update and active FTC enforcement now treat rating-based routing to a public review link as prohibited 'review gating.' ... the decision, made explicitly, is to ship the current gated version as-is."* — PRD §8.6

Ships as decided. Five things are added so that the accepted risk stays bounded and reversible.

### 3.1 A flag, and the alternative already built behind it

`review_gating.enabled`, per tenant, flippable in under 60 seconds.

- **On** (default, per the PRD): 1–3★ → private recovery voucher + private owner alert. 4–5★ → public Google review link.
- **Off** (the compliant variant, **fully built and tested**, FR-6.5): every customer is asked for a public review regardless of rating; only the *private owner alert* remains conditional on a low rating — which is not gating, because nothing about the public ask varies with the rating.

Building both is cheap now and expensive later. Building only the accepted one means that the day Google acts, the response is a sprint instead of a flag.

### 3.2 An immutable audit trail

Every request records `rating`, `routed_to`, `gating_enabled_at_send`, the voucher issued, and the owner-alert timestamp (`04-data-model.md` §10).

This exists so that if the risk materializes we can state precisely what every customer was shown and when the behaviour changed — for the café's appeal, and for our own understanding of what the exposure actually was. **An accepted risk that cannot be reconstructed is not a bounded risk; it is an unknown one.**

### 3.3 The one line that is not crossed

**The recovery voucher is never mentioned in the same message as a public-review ask** (FR-6.6), enforced by template separation and a test.

Rating-based routing is a policy violation. Offering something of value *in exchange for* a public review is a different and materially worse category — it is a straightforward deceptive-practice problem rather than a platform-policy one, and combining the two would compound the exposure well beyond what the PRD accepted. The PRD's design does not require it; this constraint makes sure an innocent-looking template edit cannot introduce it later.

### 3.4 Disclosure

The pilot agreement states plainly that this mechanism is likely non-compliant with Google's current policy and that **their** Business Profile carries the suspension risk. It is their asset, not ours. An accepted risk that is only accepted by the party who does not bear it is not accepted at all.

### 3.5 The trigger

RB-9. Any policy warning, review removal wave, or profile suspension → flip the flag immediately, export the audit trail, support the appeal, and escalate for a decision informed by what actually happened rather than by what we predicted would happen.

---

## 4. The other PRD risks

| ID | PRD status | Engineering position |
|---|---|---|
| **R3** — Fooder / Mottasl competition | Acknowledged | Product positioning, not an engineering risk. The engineering consequence is that the AI layer must be genuinely good, which is why §5.3 of the master plan insists the numbers are deterministic and explainable rather than an LLM guess. A competitor's ordering channel is easy to match; a defensible costing and forecasting layer is not |
| **R4** — Foodics API eligibility | Open | Made a **sales gate, surfaced in onboarding before any integration work**. A prospect's plan eligibility and OAuth authorization are checked at qualification, not after we have built for them. Sprint 17 is scheduled last partly because of this |
| **R5** — Placeholder costs | Open, "Low pre-launch / High if shipped" | **Promoted to an M3 launch gate and made structural.** `material_costs.source` is a queryable column; the console renders "cost not set" instead of a margin for any item touching a placeholder (FR-5.14). The risk is not managed by remembering — it is managed by the system refusing to produce the number |
| **R6** — Utility vs Marketing template classification | Open | Template submitted in **Sprint 6**, four sprints before it is needed (FR-5.4). Per-tenant template spend is tracked with an alert at 2× trailing median (NFR-49), so a silent reclassification shows up within a day rather than on a monthly invoice |

---

## 5. Risks the PRD does not list

Found during planning. Each is an engineering risk with an owner and a mitigation, not a new product debate.

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **NR-1** | **whatsapp-web.js breaks against a WhatsApp Web update** — a separate failure mode from a ban, and more frequent | High, recurring | Pinned version; health probe catches it in ≤5 min; the Cloud API fallback covers this case identically to a ban. Treated as routine, not exceptional |
| **NR-2** | **Solo operator unavailability** — illness, travel, a bad week | High | 15% sprint slack; Safe Mode reduces the system to something that runs unattended; break-glass credentials reachable by a trusted second person; runbooks written so someone else could follow them |
| **NR-3** | **Staff void fraud** (T1) | High for the café; fatal for trust in the product | Manager PIN, reason codes, immutable attribution, nightly anomaly alerts (FR-4.6, FR-4.11) |
| **NR-4** | **Owner acts on a wrong number** — an AI-generated purchase quantity or a bad margin | High | Deterministic computation with the LLM confined to phrasing; prediction intervals rather than point estimates; the placeholder gate; every AI output stored with the payload that produced it (FR-5.21) |
| **NR-5** | ~~Paymob merchant onboarding delays the pilot~~ → **Uncollected orders waste materials.** With no prepayment, the café carries the no-show risk | Medium, and it is a direct cost to the café | Kitchen-accept gate, open-order cap, no-show step-down (GAP-18, ADR-0010). Abandon rate and waste value are reported daily so thresholds are tuned in week one on real data rather than guessed in advance |
| **NR-6** | **WhatsApp in-app browser breaks the ordering webview** in ways Chrome does not | Medium, recurring | Tested in the in-app browser from Sprint 1 and on every ordering-path PR (NFR-45). This is a manual gate that stays manual |
| **NR-7** | **The café abandons the product** because it is slower than paper during a rush | **Existential** | Till speed is an NFR with a number (NFR-11); the café day simulation on real hardware before the pilot; a monthly non-incident check-in with the owner to hear workflow friction that never gets reported as a bug |
| **NR-8** | **Quality rating drops on one number, and the whole fleet loses capacity.** Since 7 Oct 2025 messaging limits are **portfolio-wide**, not per-number: all numbers in a portfolio share one capacity, and a flagged number drops the shared limit. While on a BSP (ADR-0016) every café sits in the same portfolio | **Medium-high while on a BSP** | Per-tenant send caps and complaint monitoring are load-bearing, not prudent (FR-11.11a); keep templates Utility-classified; never send marketing on the ordering number. This is the strongest argument for moving to our own Tech Provider status at ~5 cafés |
| **NR-9** | **Habit sessions do not scale linearly.** One café-owned number (Q4) means one Chromium session per café on the habit host | Medium, and it grows with success | Host sized per-café from S10; sessions supervised individually; the Cloud API migration trigger (ADR-0003) becomes partly economic — compute the crossover with real numbers at M4 |

**NR-7 is the risk most likely to actually kill this product**, and it is the one least addressed by any amount of architecture. A café that finds the Till slower than a notebook stops using it in week two, and no dashboard, invariant, or AI add-on matters after that. It is why the Till has its own latency NFR, its own offline requirement, and why the last gate before the pilot is 90 minutes of real people using it during a real rush.
