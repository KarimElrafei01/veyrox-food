# Veyrox Food — PRD Gap Analysis

Things the PRD does not say that production requires. Each is stated as: what is missing, why it matters, what I am doing, and what it costs.

**None of these contradict the PRD.** They are the difference between a specification of *what the product does* and a specification of *what must be true for it to run in a real café in Cairo*. Four are promoted to P0 because the product is genuinely not shippable without them.

---

## P0 gaps — pilot blockers

### GAP-01 — Language. The PRD never mentions Arabic.

**Missing**: no localization requirement anywhere. Every example string in the PRD and the demo is English.

**Why it matters**: the pilot is a café in Zamalek. A large share of walk-in customers will not want to order in English, and the staff using the Till and KDS certainly will not. More practically: RTL is not a translation, it is a layout mode. Mirrored icons, bidi-safe number formatting, logical CSS properties, and Arabic font subsetting all have to be in the components from the first screen. Retrofitting RTL into three finished SPAs costs three to four times what building with it costs.

**Doing**: `packages/i18n` from Sprint 1; a CI lint that fails on any literal string in a rendered component; visual regression tests in both directions. Arabic copy written by a native Egyptian copywriter, not by me — machine-translated or formal-register Arabic reads as a robot to a café customer, which undermines the whole "friendly nudge, not spam" premise of the Habit Engine.

**Decided differently from my recommendation (Q5, 2026-09-05): English is the default locale, Arabic secondary.** Recorded plainly because it cuts against this gap's reasoning. What it changes: `default_locale = 'en'`, `name_en` required and `name_ar` optional with fallback. What it does **not** change: RTL remains **P0**. Arabic is still offered and toggleable, so every layout, icon, and numeral path still has to be correct in both directions — and that is the expensive half, which is why it stays in from the first screen rather than being deferred. The residual risk is that Arabic content is entered thinly or not at all during onboarding, since it is now the optional field; the onboarding checklist (FR-10.24) should prompt for it rather than let it be skipped silently.

**Cost**: ~1 sprint spread across S1–S3 if done from the start. ~3 sprints if retrofitted. → FR-9.1, NFR-43.

---

### GAP-02 — Item availability. Nothing can be marked out of stock.

**Missing**: the PRD has no concept of an unavailable item or modifier.

**Why it matters**: cafés run out of oat milk, croissants, and a specific bean two or three times a week. Without this, the bot cheerfully sells what the kitchen cannot make. Every such order becomes a customer disappointment, a void, possibly a refund, and a corrupted material figure. It also interacts badly with the Habit Engine, which would nudge a customer to re-order "their usual" on a day it does not exist.

Note the second-order effect: this is a **P0 for data quality**, not only UX. The void rate is a lagging indicator in PRD §10 that "should stabilize, not grow" — and the single largest source of avoidable voids in a real café is selling something you do not have.

**Doing**: `is_available` on items and on modifier options independently (oat milk runs out before lattes do), auto-restoring at the next open; 86-able from the KDS where staff actually discover it (FR-3.9); availability re-checked at quote and again at order creation, with the webview correcting the cart rather than failing at checkout.

**Cost**: ~2 days. → FR-2.7, FR-3.9.

---

### GAP-03 — Store hours. The QR codes are permanent; the café is not.

**Missing**: no opening-hours model and no closed-state behaviour.

**Why it matters**: the store QR is printed and laminated. Someone will scan it at 02:00, or on the day the café is closed for a holiday. With no closed state, the bot takes an order for a kitchen that does not exist and — if payments succeed — takes money for it.

**Doing**: `store_hours` + `store_closures`; the bot replies with the next opening time and does not offer ordering; the Till is unaffected (staff may be prepping).

**Cost**: ~1 day. → FR-2.3.

---

### GAP-04 — Void authorization and attribution. The single most consequential gap.

**Missing**: PRD §8.4 specifies voiding as a workflow with **no actor, no authorization, and no anomaly detection**.

**Why it matters**: void fraud is the classic F&B theft pattern — take the cash, void the order, keep the difference. A paper ticket system at least leaves a torn ticket and a suspicious gap. A one-tap unattributed void in a digital till makes theft *easier and cleaner* than the paper it replaces. That is not a neutral omission; it is a product that actively harms the customer who adopts it.

There is also a direct conflict with the PRD's own metrics. §10 lists void rate as a lagging indicator where "a rising trend suggests a kitchen/counter workflow problem." Without attribution, a rising void rate is uninterpretable — it could be workflow, or it could be one member of staff.

**Doing**: device enrollment + per-staff PIN; **manager PIN required for voids**, with a reason code; both recorded immutably in `order_events` and on the order; EOD shows voids by staff; a nightly job flags staff whose void rate exceeds 2σ above the branch mean and any void of an already-paid order.

**Cost**: ~4 days (S5). → FR-4.6, FR-4.11, threat T1.

---

### GAP-18 — With no prepayment, nothing stops a customer causing the café to make a drink nobody collects.

**Missing**: the PRD assumes payment precedes preparation (§8.2). v1 removes payment entirely (DEC-02), and the PRD has nothing to say about what replaces the commitment prepayment provided.

**Why it matters**: prepayment was quietly doing two jobs. Taking the money was the obvious one. The other was that **the customer, not the café, carried the no-show risk** — an order that was never collected had already been paid for. Remove it and anyone with WhatsApp can make a café consume milk, beans, and barista time with zero commitment: a bored teenager, a mis-tap, or a customer who changed their mind on the walk over. In a 40-order rush that is a queue full of drinks nobody is coming for, made ahead of drinks real customers are waiting on.

This is the single most important consequence of the payment decision, and it is invisible if you only read the change as "remove the checkout screen."

**Doing** — three controls, in order of how much they matter:
1. **Kitchen-accept gate** (FR-3.11): WhatsApp orders land in a **New** column and a barista taps Accept before anything is deducted, made, or timed. They can also Reject with a reason, so a café that is slammed sends a polite message instead of silently taking an order it cannot serve. One tap, and it hands the kitchen back the control prepayment used to provide.
2. **One open unpaid order per customer** (FR-2.23) — bounds a single bad actor to one drink.
3. **No-show step-down** (FR-2.25) — three abandonments in 90 days moves that customer to counter-only. Deliberately generous; a real customer will never reach it.

And one accounting rule that is easy to get wrong: **an abandoned order does not return materials.** A void before preparation returns them because nothing was consumed; an abandonment after the drink was made does not, because the milk is genuinely gone. It is recorded as waste and reported separately, which also gives the owner the number they need to judge whether the thresholds are right (INV-7).

**Cost**: ~4 days, against roughly a sprint saved by removing the PSP. → FR-3.11–3.13, FR-2.23–2.26, ADR-0010.

---

## P1 gaps — needed by GA

### GAP-05 — No refund path for paid orders.

**Missing**: §8.4 specifies voiding an order "sent to the kitchen but never paid for." There is no path at all for cancelling an order that *was* paid — which includes every WhatsApp order, since those pay before the kitchen sees them.

**Why it matters**: a customer pays by card, then the machine breaks or they change their mind. Today's answer is "there is no button for that," which means it happens off-system: cash out of the drawer, materials never returned, and the books quietly wrong. The whole point of G4 is to stop exactly that class of unrecorded correction.

**Doing**: a manual cash refund with a manager PIN, returning materials with `reason='refund_return'` only if the order had not yet been prepared, and clawing back loyalty points. Deliberately distinct from void: different state, different authorization, different accounting treatment.

**Note — much smaller since payments were removed** (ADR-0010). Payment and collection are now the same counter moment, so a customer who changes their mind does so *before* paying, and that path is a void, not a refund. What remains is the genuine but rare case of a refund after collection.

**Cost**: ~3 days (S8). → FR-4.8.

---

### GAP-06 — Loyalty points are never clawed back.

**Missing**: §8.2 accrues points on order. Nothing removes them on void or refund.

**Why it matters**: a customer could accrue points on orders that were voided, reaching Gold on purchases that never happened. Small in money, corrosive in trust, and trivially exploitable if anyone notices. It is also an inconsistency an owner *will* spot, and spotting one inconsistency is how an owner starts doubting all the numbers.

**Doing**: the append-only `loyalty_ledger` makes this a negative row with `reason='void_clawback'`, computed inside the same transaction as the void. A mutable balance column would have made this hard; the ledger makes it three lines and auditable.

**Cost**: ~half a day, because the data model was chosen with this in mind. → FR-4.4, FR-4.8.

---

### ~~GAP-07 — No payment-provider outage fallback.~~ → **Resolved by removing payments entirely**

**Originally**: §8.2 assumed Paymob works, with no fallback for the day it does not.

**Now moot.** v1 has no payment provider (ADR-0010); every order is paid at the counter. There is no external payment dependency to fail, which removes this gap and the availability risk behind it.

**But it inverted into a new one, and that one is a P0.** Prepayment was silently doing a second job: it made a no-show cost the café nothing. Without it, anyone with WhatsApp can cause a café to consume milk and barista time with zero commitment — see **GAP-18** below.

---

### GAP-08 — "Pickup" is undefined, so Review Shield's timer has no anchor.

**Missing**: §8.6 sends the rating request "30 minutes after order pickup." The PRD's status model (§8.3) ends at *Ready*. There is no pickup event.

**Why it matters**: as written, the job either never fires (no such event) or fires 30 minutes after Ready — including for orders the customer never collected, and for orders that were subsequently voided or refunded. Asking someone to rate a coffee they never received, or one they were refunded for, is worse than not asking.

**Doing**: define pickup as the `collected` transition; fall back to 30 minutes after `ready` if the order never reaches `collected`; suppress entirely for voided or refunded orders. Implemented as a BullMQ **delayed job** scheduled at the transition, not a polling cron.

**Cost**: ~1 day. → FR-6.1, FR-6.2.

---

### GAP-09 — G1 has no denominator.

**Missing**: PRD G1 targets "≥95% of daily orders captured digitally," measured as a percentage of *estimated total footfall*. Nothing in the system knows total footfall.

**Why it matters**: this is the PRD's headline goal for the whole no-POS thesis, and as specified it is unmeasurable. It would be discovered at the 90-day review, when it is too late to have collected the data.

**Doing**: one field on the Till close-out — a manager-entered `footfall_estimate` for the day. Imperfect, but it is a number the staff already know approximately, it takes three seconds, and it turns an unmeasurable goal into a trackable one.

This is worth generalizing: **PRD G2, G3, and G5 have the same problem in milder form**, which is why FR-5.9, FR-7.6, and FR-7.7 exist. A goal whose instrumentation is not designed in before the feature ships is a goal that gets retrofitted with bad data.

**Cost**: ~half a day. → FR-4.7a.

---

### GAP-10 — Digest scheduling assumes a fixed offset; Egypt has DST.

**Missing**: §8.5.1 says 22:00. Egypt reinstated summer time and observes DST from April to October.

**Why it matters**: a naive UTC cron sends the digest at 21:00 for half the year. It is a small bug that reads to the owner as "the system is unreliable," and it is exactly the class of bug that is never diagnosed because nobody reports "my report came an hour early."

**Doing**: every repeatable job declares `tz: 'Africa/Cairo'`; all timestamps stored UTC and rendered in tenant timezone; a test asserting the schedule across a DST boundary.

Secondary point worth raising with product: **22:00 may be the wrong time** for a café that closes at 01:00 — the digest would omit a quarter of the day. Recommend making it configurable and defaulting to 30 minutes after close.

**Cost**: ~half a day. → FR-5.1, ADR-0004.

---

### GAP-11 — Recipe edits would have silently corrupted historical costing.

**Missing**: §8.5.3 treats material costs and recipes as editable values, with no versioning.

**Why it matters**: two distinct failures. (a) The void bug described at length in `04-data-model.md` §1 — recomputing a return from a since-edited recipe returns the wrong quantity, silently and cumulatively, destroying G4. (b) Editing an ingredient cost today retroactively rewrites last month's margin report, so the same report gives different answers on different days. An owner who notices this stops trusting the product, correctly.

**Doing**: recipes and prices and costs are all versioned; order lines snapshot the versions they used; NFR-19 regression-tests that a past report re-run after an edit is byte-identical.

**Cost**: ~2 days extra in the schema, and it is the cheapest two days in the project. → `04-data-model.md` §1, NFR-19.

---

## P2 gaps — noted, not scheduled

| ID | Gap | Position |
|---|---|---|
| GAP-12 | **E-invoicing-shaped receipts.** The PRD names Wave 9/10 e-receipt compliance as a market wedge (§2) but scopes no work | **Resolved 2026-09-06: v1 does not submit; e-invoicing is v2** (Q3). Receipt records still carry tax registration number, item tax codes, and a document UUID from day one, so v2 is an integration rather than a re-model — backfilling them onto historical receipts is the expensive version. The tax registration number is a per-café setting, not a platform concern |
| GAP-13 | **No cash-drawer reconciliation.** The EOD report gives expected cash; nothing captures counted cash | A one-field addition (`counted_cash_minor`) turns EOD into a real till reconciliation and makes cash discrepancies visible. Recommended for GA |
| GAP-14 | **No customer-facing order history.** A returning customer cannot see past orders or their point balance except in a message | Cheap to add to the webview and directly supports G2's "the reward feels real" premise |
| GAP-15 | **No handling for orders never collected** | Currently they sit in `ready` forever, distorting prep-time averages. Needs an auto-`abandoned` transition after a configurable window |
| GAP-16 | **Menu item photos** | Not mentioned anywhere. A café menu without images converts worse, and it has real perf implications given the 150KB budget. Worth a product decision before the menu is seeded |
| GAP-17 | **No multi-language menu content model** in the PRD's data sketch (§6.3) | Handled by `name_ar`/`name_en` columns from day one, but it is a schema decision that had to be made before the menu was seeded, which is why Q5 is a week-3 blocker |

---

## Deliberate scope reductions from the PRD

These are not gaps. They are decisions to ship **less** than the PRD specifies in v1, recorded here so the divergence is explicit rather than discovered.

### DEC-01 — One store QR, not one per table *(2026-09-05)*

**PRD §8.1 says**: "Static QR **per table**, encoding a `wa.me` deep link with a pre-filled, **table-numbered** message."
**v1 ships**: one QR for the whole store, reproduced identically on every table tent, the counter, and the menu.

**What it removes**: the table registry and its CRUD, per-table token rotation, table-resolution logic in the webhook path, per-table QR sheet generation, and the operational business of keeping physical codes mapped to physical tables (a laminated card gets moved, spilled on, or swapped between tables within a week).

**What it costs**: no per-table analytics — which was never a PRD goal — and no automatic knowledge of where to deliver. That second one needed resolving rather than ignoring, because the per-table QR was the *only* thing that populated `table_id`.

**How it is resolved**: order handoff is **counter pickup by default** (FR-1.6), which the PRD's own flow already assumes — it has a "ready" ping, a collection event, and a review request "30 minutes after pickup." For a café that does run table service, `ordering.ask_table_number` (FR-1.7, default **off**) adds one optional field to the webview whose value lands on the KDS ticket. One setting, no registry, no mapping.

**One thing that gets *more* important**: the 30-day token-rotation grace (FR-1.5). With a single code, rotating it invalidates every printed artifact in the café at once.

### DEC-02 — No payment provider; cash on pickup *(2026-09-05)*

**PRD §8.2 says**: checkout via Paymob (card), Vodafone Cash, and InstaPay, paid before the kitchen sees the order.
**v1 ships**: no PSP at all. Every order — WhatsApp and counter — is paid at the counter on collection, in cash or on the café's own terminal recorded as the `visa` label.

**What it removes**: the riskiest third-party integration in the plan (intention creation, hosted checkout, HMAC callback verification, webhook idempotency, reconciliation), the `pending_payment`/`expired` states, **PCI scope entirely**, the redirect out of the WhatsApp in-app browser (the biggest conversion risk on the ordering path), merchant onboarding as a schedule dependency, and a whole class of "charged but no order" incidents. Marginal cost per order drops to about zero.

It also **converges the two channels onto one state machine** with one payment moment — a genuine simplification, not just a subtraction.

**What it costs**: the café now carries the no-show risk (**GAP-18**, addressed above); there is no committed remote ordering; and the café's cash drawer becomes the only external cross-check, which raises the weight on payment attribution (INV-6) and the void controls (FR-4.6) rather than lowering it. Loyalty accrues at collection rather than at order, so the PRD's "points update immediately after I order" becomes "when you collect" — a small regression, arguably more honest.

**Reversibility**: the full Paymob design is retained in ADR-0010 as the v2 path. Orders carry `payment_method` and a `payments` row from day one, so adding an online method later is a new method value and an earlier payment moment, not a re-model.

---

## Summary of added scope

| Priority | Count | Total added effort |
|---|---|---|
| P0 | 4 gaps (GAP-01 to GAP-04) | ~1.5 sprints, mostly absorbed into S1–S5 because they are built in rather than bolted on |
| P1 | 7 gaps (GAP-05 to GAP-11) | ~1 sprint, distributed |
| P2 | 6 gaps | Not scheduled; schema kept forward-compatible |

Roughly **2.5 sprints of added scope**, already absorbed into the sprint plan. The alternative is not "2.5 sprints saved" — it is a pilot café that cannot mark oat milk unavailable, cannot read the interface, cannot attribute a void, and takes orders at 2am, with a margin report that changes when you look at it twice.
