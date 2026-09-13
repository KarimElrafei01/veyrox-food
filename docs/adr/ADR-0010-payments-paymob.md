# ADR-0010 — No payment provider in v1; cash on pickup, and a kitchen-accept gate

**Status**: Accepted · **Date**: 2026-09-05
**Supersedes**: the original ADR-0010 (Paymob hosted checkout), which is retained below as the deferred v2 design.

## Context

PRD §8.2 specifies checkout via Paymob (card), Vodafone Cash, and InstaPay, with the customer paying before the order reaches the kitchen. **v1 ships with no payment integration at all.** All orders — WhatsApp and counter alike — are paid at the counter on collection.

## Decision

- **No PSP integration in v1.** No Paymob, no card, no wallet, no InstaPay.
- **All orders are paid on pickup**, in cash or on the café's own card terminal (recorded as the `visa` label, per PRD §4 — a reconciliation label, never an integration).
- **WhatsApp and counter orders converge on one state machine.** The `pending_payment` and `expired` states disappear; there is one flow with one payment moment.
- **A kitchen-accept gate is added** (FR-3.11): WhatsApp orders land on the KDS as **New** and a barista taps Accept before materials are deducted and prep begins.
- **No-show controls are added** (FR-2.23 to FR-2.25): a per-customer open-order cap, an auto-`abandoned` transition, and a no-show counter that steps a repeat offender down to counter-only ordering.

## Why the accept gate is not optional

This is the decision that matters, and it exists because removing prepayment moves a real cost onto the café.

Under the original design, payment preceded preparation. A customer who never showed up cost nothing: the money was already taken, and the materials were only consumed because a paid order existed. **Without prepayment, anyone with WhatsApp can cause a café to consume milk, beans, and barista time with no commitment whatsoever** — a bored teenager, a mis-tap, or a customer who changed their mind on the walk over. In a 40-order rush that is not a rounding error; it is a queue full of drinks nobody is coming to collect, made ahead of drinks that real customers are waiting for.

Three controls, in order of how much they matter:

1. **The accept gate.** A barista sees the ticket and taps Accept. Nothing is deducted, nothing is made, and the ETA clock does not start until then. During a rush the barista can also reject with a reason ("too busy", "item unavailable"), which sends the customer a polite message instead of silently taking an order the café cannot serve. This costs one tap and gives the kitchen back the control that prepayment used to provide.
2. **One open unpaid order per customer** (setting, default 1). A customer with an uncollected order cannot place another. This bounds the damage from a single bad actor to one drink.
3. **A no-show counter.** After three `abandoned` orders inside 90 days, the customer's WhatsApp ordering is stepped down: the bot tells them politely to order at the counter. Reversible by the owner from the Store Console. This is the only durable defence against deliberate abuse, and it is deliberately generous — a real customer will not hit it by accident.

**Abandoned orders do not return materials.** This is the correct accounting and it is worth stating explicitly: a void (before preparation) returns materials because nothing was consumed; an abandonment (after the drink was made) does not, because the milk is genuinely gone. It is recorded as waste and reported separately on the EOD and the digest, which also gives the owner the number they need to decide whether the accept gate's thresholds are set right.

## What this buys

Removing the PSP is one of the largest simplifications available in this system:

| Removed | Consequence |
|---|---|
| Paymob intention, hosted checkout, redirect handling | The riskiest third-party integration in the plan, and the one most likely to blow its estimate |
| HMAC callback verification over a provider-specified field order | The subtlest security control in the system, and the contract test most often got wrong |
| Payment webhook idempotency and the `payment.reconcile` job | An entire class of "charged but no order" incidents (RB-2) stops existing |
| `pending_payment` / `expired` states, INV-6 double-capture | A simpler state machine and one less invariant |
| **PCI scope entirely** | Not SAQ-A — no scope at all. Card data was never near us; now neither is a payment flow |
| A redirect out of the WhatsApp in-app browser | The single biggest conversion risk on the ordering path (NFR-45) disappears |
| Merchant onboarding as a schedule dependency | Open question Q1 is closed. Paymob merchant setup was the highest-likelihood schedule risk in the plan |

The marginal cost per order drops to approximately zero (NFR-48), which materially improves the unit economics of a product sold to informal operators with thin margins.

## What this costs

Stated honestly, because these are real:

- **The café carries the no-show risk** that the customer used to carry. Mitigated but not eliminated by the three controls above.
- **No remote/ahead ordering with committed payment.** A customer ordering from the office cannot pay in advance, so the café has less certainty about which orders are real. The accept gate means they are not making them speculatively, which is most of the protection.
- **Cash handling stays fully manual**, so the till reconciliation in FR-4.7 becomes the *only* record of what was taken. That raises the importance of the void controls (FR-4.6) rather than lowering it.
- **Loyalty accrual moves to collection** rather than order placement, so the PRD's "points update immediately after I order" story becomes "points update when you collect." A small product regression, and arguably more honest.

## Alternatives considered

**Keep Paymob as an optional payment method alongside cash.** Rejected for v1. It preserves every cost in the table above — the integration, the webhook, the PCI question, the merchant onboarding dependency — to serve a payment path that some customers would skip anyway. If prepayment is wanted later, it is added as an option on top of a working cash flow rather than as a prerequisite for launch.

**Cash on pickup with no accept gate.** Rejected. It is the naive version of this change and it pushes an uncontrolled cost onto the café during exactly the twenty minutes when they can least absorb it. The gate costs one tap.

**Require a deposit or a confirmation reply.** Rejected — a deposit needs a PSP, which is the thing being removed, and a confirmation reply adds a round trip to a flow whose entire premise is zero friction.

## Reversal — the deferred v2 design

If prepayment is wanted later, the original design stands and is unchanged in substance:

- Paymob hosted checkout (intention → redirect → callback), **PCI SAQ-A**, no card data on our infrastructure.
- **The signature-verified webhook is the only thing that sets an order to paid** — never the browser redirect, which can be lost to a closed tab or forged by navigating to the success URL.
- Paymob's HMAC is computed over a specific concatenation of fields in a specific order, not the raw body; get the order wrong and the validator accepts everything. A contract test replaying a recorded callback, plus a **tampered-HMAC rejection test**, is mandatory.
- A reconciliation job every 5 minutes catches whatever the webhook loses to outages, partitions, and deploys.

Nothing in v1 forecloses this. Orders carry `payment_method` and a `payments` row from day one; adding an online method is a new method value, a new provider integration, and an earlier payment moment in a state machine that already supports paying at a point other than collection.

## Related: ADR-0024

ADR-0024 adds a tenant-optional exception to the accept gate above (`kitchen.auto_accept`): a café
may opt its own orders straight past Accept, at its own risk. The analysis in "Why the accept gate
is not optional" is unchanged and the gate stays on, by default, for every café — this is not the
"cash on pickup with no accept gate" alternative rejected above, which would have removed it for
everyone.
