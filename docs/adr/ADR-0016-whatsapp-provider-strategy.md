# ADR-0016 — WhatsApp: BSP first, own Tech Provider status at ~5 cafés

**Status**: Accepted · **Date**: 2026-09-06

## Context

Each café needs its own in-chat menu on its own number. Cloud API supports this natively — the webhook payload carries `phone_number_id`, and the API routes on it to that tenant's menu. That is what `tenants.wa_phone_number_id` is for; it is a routing concern, not an architectural one.

The real question is not *can we*, but **under whose WhatsApp Business Account the cafés' numbers live**, because that determines who must pass Meta Business Verification.

Two structures:

- **A — each café owns its WABA.** Café brand, café number, café verifies. Accessed through Embedded Signup, which requires us to be a registered **Meta Tech Provider**. Quality rating is isolated per café.
- **B — numbers under a provider's verified WABA.** No café needs to verify. Display names are reviewed and one unrelated to the verified business can be rejected, and **all cafés share one account's quality rating**.

~~This matters more than it looks, because the PRD's core segment is Egypt's ~250,000 *unregistered* cafés (§2), and Business Verification requires exactly the legal documentation an informal operator does not have. **Structure A is unavailable to a large share of the target market.**~~

**Corrected 2026-09-06 — see the verification section below.** Business Verification is *not* an entry gate: unverified businesses can use Cloud API with a 250 business-initiated-conversation daily cap, which our customer-initiated ordering flow never approaches. The real deciding factor is not verification but **shared messaging capacity** under structure B.

## Decision — final, 2026-09-06

**Launch on Fiwano. Each café gets its own WABA. Go direct on Cloud API later, behind an adapter.**

Fiwano is a **verified Meta Tech Provider** with its own approved Meta app. Cafés connect their own WhatsApp accounts through Facebook OAuth, so **each café owns its WABA** — this is Model A, without us needing App Review on the critical path.

**Pricing**: $12/mo Starter, $19/mo Pro, per connected account. Flat, unlimited inbound and outbound. Meta bills business-initiated templates directly to the café, bypassing Fiwano. At five cafés that is ~$60/month — roughly a quarter of 360dialog's equivalent, and it delivers per-client WABAs rather than shared ones.

### Why this beats the alternatives

| Option | Per café/mo | Per-client WABA | Blocker |
|---|---|---|---|
| **Fiwano** | **$12–19** | **Yes** | None |
| Direct Cloud API | ~$0 | Yes (we become Tech Provider) | App Review latency |
| 360dialog client tier | €49 | Yes | 4× the cost |
| 360dialog Partner Hub | €250/mo floor | Yes | Unaffordable pre-revenue |
| AWS / Twilio / Bird | ~$200 | n/a | Per-message billing is structurally wrong for a message-heavy, Meta-fee-light product |
| Unipile, Maytapi, Whapi | €5–49 | No | **Unofficial QR-linking. Not for the ordering rail** |

### The one architectural cost, and its mitigation

Fiwano exposes **a unified REST API across WhatsApp, Instagram and Messenger — not raw Meta webhooks.** Our handlers and send calls would be written against their shape rather than Meta's, so going direct later means rewriting that layer.

**Mitigation — a `MessagingChannel` adapter, same pattern as `HabitChannel` (ADR-0003):**

```ts
interface MessagingChannel {
  sendText(to: PhoneE164, body: string): Promise<SendResult>;
  sendCtaUrl(to: PhoneE164, body: string, cta: CtaButton): Promise<SendResult>;
  sendTemplate(to: PhoneE164, template: TemplateRef): Promise<SendResult>;
  parseInbound(payload: unknown): InboundMessage;   // normalises to OUR shape
}
// FiwanoChannel · CloudApiChannel — both implemented against the same contract
```

Everything above the adapter speaks our own normalised `InboundMessage`, keyed by tenant. Written this way from Sprint 0, moving to direct Cloud API is a swap, not a rewrite — and the same interface is what makes the eventual cost saving reachable without a project.

### Must confirm with Fiwano before building against them

1. **CTA-URL buttons.** The entire entry flow is a message carrying a URL button that opens the webview. Instagram and Messenger have no such primitive, so a three-channel abstraction is exactly where it tends to be dropped. **If Fiwano cannot send a CTA-URL button, the specced flow does not work on them** — this is a Sprint 0, day-one question.
2. **Template creation and submission** — needed for the nightly digest (FR-5.4).
3. **Egypt number registration.**
4. **Billing** — $12 charged to us per café, or to the café directly.

### Migration trigger

Move to direct Cloud API when the Fiwano bill exceeds the cost of maintaining our own Tech Provider status, or if the adapter proves unable to express something Cloud API offers. Start Business Verification for Veyrox AI now regardless: it is free, slow, blocks nothing, and is required whenever we go direct.

---

## Superseded reasoning — direct-first *(2026-09-06, before Fiwano was identified)*

**Skip the BSP. Go direct on Meta Cloud API under our own WABA, then register as a Tech Provider when we need per-café WABAs or pass 20 numbers.**

The original decision was BSP-first, to keep App Review off the critical path. Research showed the premise was wrong twice over:

1. **Direct Cloud API access needs no BSP and no App Review.** Advanced access to `whatsapp_business_messaging` is only required to act on *other businesses'* WABAs. Numbers under **our own** WABA use Standard access, available immediately.
2. **A new business portfolio can register 2 phone numbers, rising automatically to 20** once the business is verified *or* the messaging limit reaches 2,000. Two numbers covers the pilot café plus a test number; twenty covers roughly twenty cafés — well past the point where structure A becomes the right answer anyway.

**Our billable volume is the reason this matters.** The ordering flow is customer-initiated, so it lives inside the free 24-hour service window: greeting, confirmation, ready ping, and review request cost nothing. The Habit Engine runs on the unofficial rail entirely. **The only billed message on the official rail is the nightly digest to the owner — about 30 per café per month.**

At that volume every BSP pricing model is a bad deal:

| Model | Example | Cost at 5 cafés (~150 billable msgs/mo) |
|---|---|---|
| **Direct Cloud API** | — | **Meta's per-message rate only. No platform fee** |
| Flat license | 360dialog, ~€49/mo | ~€49/mo for 150 messages. Breaks even around 10,000 msgs/mo — we are two orders of magnitude below that |
| Per-message markup | Twilio/Bird ~$0.005 | ~$0.75/mo markup. Cheap in absolute terms, but still a dependency bought for nothing |

A flat license is pure waste at our volume, and a markup buys a middleman for under a dollar a month. Neither earns its place.

### When to revisit

- **Past ~20 numbers**, or when cafés want to own their own WABAs (structure A) — that is when Tech Provider status and Embedded Signup become necessary, per the sections below.
- **If direct onboarding proves operationally painful.** Adding each café's number to our WABA requires an SMS/voice OTP on their handset. That is a five-minute step during onboarding, not a blocker — but if it turns out to be a recurring support burden, a BSP that handles provisioning is worth reconsidering.
- **If we ever need support at 3am.** Direct means Meta's documentation and no account manager. Acceptable for a solo operator who is going to read the docs anyway.

### If a BSP is wanted anyway

For this volume profile the ranking is: **Twilio** (best documentation and reliability; the ~$0.005/msg markup is under a dollar a month at our scale), then **Gupshup** (lowest markup at ~$0.001, but the platform is oriented to India and Southeast Asia), then **360dialog** (cleanest pass-through economics, but the flat licence only pays off above ~10,000 messages/month).

**Not** the end-user SaaS products in this category — Wati, AiSensy, Interakt and similar. They are chat *products*, not infrastructure: they wrap the API in their own inbox and would compete with the thing we are building.

- **Now → ~5 cafés**: numbers provisioned under a BSP's WABA. No verification friction, fastest path to a working pilot, no App Review on the critical path.
- **At ~5 cafés**: begin our own Tech Provider registration — a Meta app with the WhatsApp product, **App Review** for `whatsapp_business_management` and `whatsapp_business_messaging`, and **Business Verification for Veyrox AI itself**.
- **After approval**: onboard new cafés directly, and migrate existing ones opportunistically.

Becoming a Tech Provider is largely self-serve — it is not the old gatekept BSP partner programme, there is no fee to Meta, and conversation pricing is unchanged. The gate is App Review turnaround and our own business verification.

## Why not go direct from day one

App Review takes days to weeks and can bounce. Putting it on the critical path to M1 risks the entire ordering loop on an external review queue, for a benefit — per-café WABAs — that has no value until there are multiple cafés. The BSP absorbs that risk for a markup we can afford at pilot volume.

## Why not stay on a BSP indefinitely

Three reasons, in order of weight:

1. **Shared quality rating.** Under B, every café sits on one account's rating. One café whose customers report it degrades messaging limits for all of them. That is an unacceptable coupling once the fleet is real, and it is not something a per-tenant send cap fully fixes.
2. **Per-conversation markup** compounds with volume.
3. **Embedded Signup** is how cafés get onboarded without manual number provisioning — the difference between onboarding café #20 in minutes and in a support call.

## The migration cost, stated plainly

**Moving numbers from a BSP's WABA to ours is not free.** It requires number migration and re-approval of message templates, plus coordination with each café. Cheap at 5 cafés, painful at 30.

That is the whole reason for the ~5-café trigger: it is early enough that migration is trivial, and late enough that the pilot is not blocked on App Review. **Register before the trigger, not at it** — the registration can sit approved and unused, and holding it costs nothing.

## What this does not change

The routing code is identical under both structures. `phone_number_id` → tenant is the same lookup either way, so the structure is a **per-tenant configuration decision, not an architecture one**. Build for A, launch on B.

## Consequence that needs a requirement

Under B there is **no per-café quality-rating isolation**, which the Platform Admin's rails view (FR-11.11) currently assumes. While on a BSP, per-tenant send caps, complaint monitoring, and template-quality tracking carry more weight, because a single café's behaviour is a fleet-wide risk rather than a local one. That is now an explicit requirement (FR-11.11a) rather than an emergent property of per-café numbers.

## Verification against Meta's current documentation — 2026-09-06

This ADR was originally written from general knowledge. It has now been checked against Meta's live documentation. **One premise was wrong and is corrected below; one risk turned out to be worse than described.**

### Confirmed

- **Tech Provider is the current designation**, and the process is self-serve with no fee: a Meta app with the WhatsApp use case, **Business Verification of Veyrox AI itself**, then App Review for Advanced access to `whatsapp_business_management` and `whatsapp_business_messaging` — including two demonstration videos (sending/receiving a message, creating a template).
- **Embedded Signup requires Tech Provider or Solution Partner status.** Tech Providers use business tokens exclusively, exchanged server-to-server from a code returned by the signup flow.
- **Our cost model holds**: billing is per delivered template message (since 1 July 2025); **non-template messages inside the 24-hour customer service window are free**, and **utility templates inside an open CSW are free**. Our ordering flow is customer-initiated, so it sits inside the CSW throughout.

### Correction — café Business Verification is *not* a blocker

The original ADR claimed structure A was "unavailable to a large share of the target market" because informal cafés cannot pass Business Verification. **That was wrong.**

Meta allows businesses onto Cloud API **without** completing Business Verification, capped at **250 business-initiated conversations per rolling 24 hours**, with automatic tier promotion on sustained message quality. Verification raises the ceiling; it is not an entry gate.

That cap is irrelevant to us: **our ordering flow is customer-initiated.** The customer scans the QR and messages first, which opens the 24-hour window — greeting, confirmation, ready ping, and review request all sit inside it and are neither business-initiated nor billed. The only business-initiated message on the official rail is the **nightly digest to the owner: one per day, per café.**

So an unverified café works fine on either structure. The go-to-market blocker I identified does not exist.

### Escalation — messaging limits are now portfolio-wide

**As of 7 October 2025, messaging limits are calculated at the business portfolio level, not per phone number.** All numbers in a portfolio share one messaging capacity. Quality rating is still assessed per number, but when a number is flagged, the **shared portfolio limit** drops.

This makes structure B's coupling concrete and worse than originally described: one café whose customers block or report it degrades the messaging capacity of **every other café on that BSP's portfolio**. The mechanism now has a name and a date.

Consequences:
- The decision to move to our own Tech Provider status is **more urgent, not less** — and its justification shifts from "per-conversation markup" to "shared capacity is a real operational coupling."
- Per-tenant send caps and complaint monitoring (FR-11.11a) move from prudent to **load-bearing** while on a BSP.
- **The ~5-café trigger stands**, now for a better reason than the one originally given.

### Watch items

- **Embedded Signup v2 is deprecated on 15 October 2026** — any implementation must target **v4**. Relevant when structure A is built, not now, but it dates the work.
- Tech Providers must ensure onboarded businesses **add a payment method** to their WABA.
- **Pricing discrepancy, unresolved.** Several third-party sources claim service messages become chargeable from 1 October 2026 at utility/authentication rates. **Meta's own pricing documentation contradicts this** and states non-template CSW messages remain free. NFR-48 is left unchanged on the official source, but this is worth re-checking in early October — if the third-party claim is right, marginal cost per order stops being zero and NFR-48/49 need revising.

**Sources**: Meta for Developers — Tech Provider onboarding, Embedded Signup overview, Pricing, Messaging Limits (all retrieved 2026-09-06).
