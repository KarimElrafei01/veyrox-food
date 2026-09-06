# Product Requirements Document: Veyrox Food

| | |
|---|---|
| **Product** | Veyrox Food — WhatsApp Micro-OS for Independent Cafés |
| **Owner** | Veyrox AI |
| **Status** | Draft v1.0 |
| **Market** | Egypt (Cairo/Zamalek pilot), F&B independents |
| **Last updated** | 2026-08-29 |

---

## 1. Executive Summary

Veyrox Food is a WhatsApp-native operating layer for independent Egyptian cafés: ordering, kitchen display, a counter till, owner analytics, and automated customer retention — built around WhatsApp because it is already installed on every customer's phone, and around zero/low hardware cost because a large share of the addressable market (Egypt's unregistered/informal F&B segment) has no real POS today.

The product is split into two integration tracks depending on whether a café already runs a POS (e.g., Foodics):

- **No-POS track**: Veyrox Food *is* the system of record — full analytics accuracy, no third-party dependency.
- **Has-POS track**: Veyrox Food is an analytics/AI add-on layer reading order data via the POS's API; ordering-channel competition (Fooder, Mottasl/Qoodz) already exists in this lane, so this track leads with the AI layer (recipe costing, habit engine, loyalty), not with WhatsApp ordering itself.

Messaging is split across two technical rails (see §6): the customer-facing ordering flow and owner notifications run on the **official WhatsApp Business Platform**; the **Habit Engine only** runs on **whatsapp-web.js**, an unofficial automation library, by explicit decision — documented with its risk in §9.

---

## 2. Problem Statement

Egypt's F&B market is large and fragmented: roughly 45,000 registered restaurants and an estimated 250,000+ unregistered ones (café/kiosk-scale operators with no formal POS). These businesses currently run on WhatsApp for informal customer contact, paper tickets or memory for kitchen coordination, and gut feel for pricing and purchasing — while food-cost inflation has been volatile enough (single-digit swings month to month) that flat "raise everything 10%" pricing quietly erodes margin on the wrong items.

Existing WhatsApp-ordering tools in the market (Fooder, Mottasl/Qoodz) solve the ordering-channel problem for cafés already on Foodics, but none combine ordering with real operational intelligence — recipe-level costing, raw-material-aware analytics, automated win-back marketing, and a compliant review-management flow — in one product built for the no-POS segment specifically.

**Cost of not solving this**: informal operators keep making purchasing and pricing decisions blind, lose walk-away/no-show revenue with no recovery mechanism, and have no path to the ETA e-receipt compliance wave (Wave 9/10, EGP 500K–3M revenue bracket) already reaching their segment.

---

## 3. Goals

| # | Goal | Metric | Target (90 days post-launch, pilot café) |
|---|---|---|---|
| G1 | Replace paper/manual order tracking for the no-POS segment | % of daily orders captured digitally (WhatsApp + Cashier till combined) | ≥ 95% |
| G2 | Give owners real per-item margin visibility | Owner opens Recipe Costing tab | ≥ 3x/week |
| G3 | Recover revenue from walk-away/lapsed customers | Win-back message → completed order conversion | ≥ 8% |
| G4 | Reduce stock-usage reporting error from uncaptured voids | Void rate correctly reconciled with material returns | 100% of voided orders |
| G5 | Keep customers inside the free 24-hour WhatsApp window as much as possible | % of Habit Engine sends that get a reply (reopening free-form messaging) | ≥ 40% |

**Business goal**: prove the no-POS-track model with one pilot café (fictional persona: "Brew & Baladi," Zamalek) before selling the Has-POS analytics-only track to Foodics-connected accounts.

---

## 4. Non-Goals (v1)

- **Native mobile app** — the entire premise is zero-download; a native app is explicitly out of scope.
- **Full real-time inventory-on-hand system** — v1 tracks *usage* (sales × recipe) and *void returns*, not a live stock-count ledger with purchase-order reconciliation. That's a v2 consideration.
- **Card-present payment terminal** — Cashier till supports Cash and Visa as payment *labels* for reconciliation; it does not integrate a physical card reader in v1. (Visa payments are assumed to run through the café's existing card terminal; the till just records which method was used.)
- **Direct Foodics write-back** — the Has-POS track is read-only analytics in v1. Veyrox Food does not push orders or menu changes into Foodics.
- **Multi-branch support** — v1 is single-branch. Multi-branch rollout (shared menu, per-branch analytics) is a P2 consideration (§8.9).
- **Dynamic/surge pricing** — the Off-Peak Pricing AI add-on is deliberately one-directional (discounts only, off-peak). Peak-hour price increases are explicitly out of scope, permanently, not just for v1 (see §9 for the Wendy's precedent that motivates this).

---

## 5. Personas

| Persona | Description | Primary surface |
|---|---|---|
| **Walk-in/WhatsApp Customer** | Orders via table QR → WhatsApp, or at the counter | Customer Chat (WhatsApp) |
| **Barista** | Prepares orders, manages queue | Barista KDS |
| **Cashier/Counter Staff** | Rings up walk-in orders, takes payment, handles cancellations | Cashier Till |
| **Owner/Manager** | Reviews performance, sets pricing inputs, decides on AI add-ons | Owner Dashboard |
| **Regular/Lapsed Customer** | Habit Engine's re-engagement target | WhatsApp (via Habit Engine) |

---

## 6. System Architecture Overview

### 6.1 Messaging rails (critical architectural decision)

Two separate messaging integrations, deliberately:

| | Official WhatsApp Business Platform | whatsapp-web.js |
|---|---|---|
| **Used for** | Customer ordering conversation, order confirmations, KDS "ready" pings, nightly owner digest, Review Shield | **Habit Engine only** (morning re-order nudge, win-back message) |
| **Mechanism** | Meta Cloud API, official Webviews for the ordering UI, Message Templates for anything outside the 24h window | Unofficial browser automation of a regular WhatsApp Web session |
| **Approval/opt-in needed** | Yes — templates reviewed by Meta, opt-in required for Marketing category | No |
| **Cost model** | Free within 24h customer-service window; per-message cost for Marketing/Utility templates outside it | No official per-message fee (uses a regular WhatsApp number) |
| **ToS status** | Fully compliant, sanctioned | **Violates WhatsApp's Terms of Service** — see Risk R1, §9 |

**Rationale for the split**: the ordering flow lives inside the 24-hour window (customer just messaged to order) so it's free and unrestricted on the official platform regardless. The Habit Engine's two flows are business-initiated *outside* that window by definition — the official route would require pre-approved Marketing templates, explicit opt-in, and per-message fees, with a hard cap of ~2 marketing templates/day/user across all businesses. The whatsapp-web.js route removes that friction entirely. This was an explicit, informed trade-off (see §9, R1) — not an oversight.

### 6.2 Component map

```
Customer's phone (WhatsApp) ──► Official Cloud API ──► Backend (Node/Express)
                                                              │
Table QR ──────────────────────────────────────────────────►│
                                                              ├──► Supabase (Postgres)
Barista tablet (KDS, browser) ◄──── Realtime subscriptions ──┤
Cashier tablet (Till, browser) ◄──── Realtime subscriptions ─┤
Owner (Dashboard, browser/WhatsApp digest) ◄─────────────────┤
                                                              │
Habit Engine cron (n8n / BullMQ) ──► whatsapp-web.js session ──► Regular WhatsApp number ──► Customer's phone
```

### 6.3 Data model (high level)

- `customers` — phone, name, loyalty points, tier
- `orders` — channel (whatsapp | cashier), items, modifiers, status, payment_method, total
- `order_items` — line items with resolved modifier price deltas
- `raw_materials` — id, name, unit, cost_per_unit (owner-editable)
- `recipes` — item → [{material, qty}] mapping
- `voids` — order_id, returned_materials (computed at void time), timestamp
- `habit_rules` — cron schedule, query definition, message template, channel (locked to whatsapp-web.js)

---

## 7. User Stories

**Customer**
- As a customer, I want to scan a QR code and order without installing an app, so ordering has zero friction.
- As a customer, I want to customize my drink (size, milk, ice) before adding it to my cart, so I get what I actually want.
- As a customer, I want to see how long my order will take before I pay, so I can decide whether to wait.
- As a customer, I want my loyalty points and tier to update immediately after I order, so the reward feels real.
- As a lapsed customer, I want a friendly nudge with a discount if I haven't ordered in a few days, so I feel remembered, not spammed.

**Barista**
- As a barista, I want every order to appear as a ticket I can advance with one tap, so I don't need a separate order-taking step.
- As a barista, I want the customer notified automatically when their order is ready, so I don't have to remember to text them.

**Cashier**
- As a cashier, I want to ring up a walk-in order as fast as a WhatsApp order, so counter customers aren't second-class.
- As a cashier, I want to void an order that was sent to the kitchen but never paid for, so materials aren't lost from the books.
- As a cashier, I want an end-of-day report showing cash vs. card totals and any voided materials, so closing the till is a two-minute job.

**Owner**
- As an owner, I want to see which items sell and how much raw material they consume, without manual stock counts.
- As an owner, I want to enter what I actually pay for ingredients and see true margin per item, so I know what's actually profitable.
- As an owner, I want to know immediately if a customer left a bad rating, so I can fix it before it's public.
- As an owner using an existing POS, I want the dashboard to clearly tell me when I'm only seeing partial (WhatsApp-only) data, so I don't make decisions on an incomplete picture.

---

## 8. Feature Requirements

### 8.1 Table QR Entry — P0
- **P0**: Static QR per table, encoding a `wa.me` deep link with a pre-filled, table-numbered message.
- **P0**: Scanning opens WhatsApp directly to the business number with the message pre-filled — no manual number entry.
- Acceptance: scanning any table's QR opens WhatsApp within 2 taps total (camera → open link).

### 8.2 Customer Ordering (WhatsApp) — P0
- **P0**: Bot greeting with an "Order Ahead" CTA, opening a Webview inside the WhatsApp chat.
- **P0**: Categorized menu (Espresso / Cold Brew / Pastries / Beans).
- **P0**: Per-item modifiers where applicable: size (Regular/Large), milk (Whole/Oat/Almond/Skim), ice style (Cubes/Blended) — priced deltas applied live.
- **P0**: Cart with running total; checkout via Paymob (card), Vodafone Cash, or InstaPay.
- **P1**: Add-on upsell prompt after first cart item (single occurrence per session).
- **P1**: Cross-sell ("frequently bought together") screen before payment.
- **P0**: Order confirmation includes a dynamically computed ETA (base prep time + cart size + live kitchen queue depth) and loyalty points earned.
- **P0**: Loyalty tiers — Bronze (0–150 pts, 1x), Silver (151–500, 1.2x + free alt-milk), Gold (501+, 1.5x + priority prep). Tier-up triggers an in-chat celebration message.
- Acceptance: an order placed end-to-end (menu → modifiers → payment) reflects correct pricing, correct ETA relative to current KDS queue, and correct point accrual.

### 8.3 Barista KDS — P0
- **P0**: Three-column board (Received / Preparing / Ready), tablet-optimized.
- **P0**: Tapping a ticket advances its status; reaching "Ready" auto-sends the customer a WhatsApp "order ready" message via the official platform (within the 24h window, since the customer just ordered).
- **P0**: Queue depth (Received column count) feeds the customer-facing ETA calculation in real time.
- Acceptance: ticket status changes reflect in under 1s across KDS and any dependent ETA calculation.

### 8.4 Cashier Till — P0
- **P0**: Flat item grid (no modifiers required for speed) with running cart.
- **P0**: "Send to Kitchen" registers the order as **Pending** in the KDS New column. The kitchen must tap Accept before materials are deducted and preparation begins; Accept transitions the order to **Received**.
- **P0**: A Ready order can be marked **Paid (Cash)** or **Paid (Visa)** on collection. Pending orders can be rejected without material movement.
- **P0 — Void/Refund mechanism**: voiding an accepted/prepared order returns exactly the raw materials that order deducted, by negating the original ledger rows. This must be atomic and auditable.
- **P0**: End-of-Day report: cash order count + total, visa order count + total, voided order count, itemized list of raw materials returned from today's voids.
- Acceptance: for any voided order, the sum of returned materials exactly matches the sum that was deducted at send-time, with no manual reconciliation step.

### 8.5 Owner Dashboard — P0
Sub-sections, tab-organized:

**8.5.1 Nightly Digest — P0**
- Auto-sent via WhatsApp at 22:00 (official platform, Utility-category template since it's a scheduled operational report, not promotional).
- Revenue, order count, avg prep time, Review Shield summary, repeat-customer rate.
- **P0**: Cashier payment breakdown — cash orders (count + amount) and visa orders (count + amount).

**8.5.2 Item Analytics — P0**
- Ranked units-sold-per-item (this week).
- Raw material usage, computed automatically as Σ(units sold × recipe quantity) — no manual stock counting.

**8.5.3 Recipe Costing — P0**
- Owner-editable cost-per-unit for every raw material.
- Live-computed cost, price, and margin (%) per menu item, color-coded (≥70% good, 50–70% mid, <50% low).
- Running "total ingredient spend this week" figure.
- **P1**: "Simulate +10% [ingredient] price" quick-action to demo margin sensitivity.

**8.5.4 AI Add-Ons — P1** (all four are opt-in, priced separately, shown with live previews before purchase)
| Add-on | Function |
|---|---|
| Demand Forecasting & Waste AI | Daily purchase list from real sales patterns |
| Off-Peak Pricing AI | Off-peak discounts only — **never** peak-hour surcharges (permanent constraint, §4) |
| Menu Engineering AI | Star/Plowhorse/Puzzle/Dog classification per item |
| Ramadan-Ready Labor Scheduling | Auto-generated staffing roster around the iftar demand spike |

**8.5.5 No-POS / Has-POS toggle — P0**
- Switching to "Has POS" surfaces a visible data-scope banner on Digest and Item Analytics ("WhatsApp-channel orders only — connect [POS] for the full picture") and adds a matching note to the two sales-volume-dependent AI add-ons (Forecasting, Menu Engineering).
- Recipe Costing is unaffected by this toggle (doesn't depend on sales-volume completeness).
- Acceptance: no dashboard panel may present partial (WhatsApp-only) data as if it were complete, under any toggle state.

### 8.6 Review Shield — P0, ships as-is (accepted risk — see §9, R2)
- Rating request sent 30 minutes after order pickup.
- **As currently specced**: ratings of 1–3★ are shown a private recovery voucher and privately alert the owner; only 4–5★ ratings are shown the public Google review link.
- **This exact mechanism carries a documented, accepted risk** — see §9, R2 — because Google's April 2026 policy update and active FTC enforcement now treat rating-based routing to a public review link as prohibited "review gating." A compliant alternative (ask every customer for a public review regardless of rating; route only the *private alert* conditionally) was proposed during design; the decision, made explicitly, is to ship the current gated version as-is.

### 8.7 Habit Engine — P0 (whatsapp-web.js only, per architectural decision in §6.1)
- **Rule 1 — Morning re-order nudge**: daily 08:15 cron; targets customers with ≥3 orders in the 08:00–09:00 window over the last 7 days; sends a 1-tap re-order message for their usual item.
- **Rule 2 — Win-back check-in**: daily 21:00 cron; targets "regulars" (≥3 orders in last 14 days) whose most recent order is 2–3 days old (inclusive window — not open-ended, to avoid stale re-engagement to long-lapsed customers); sends a check-in message with a one-time 10% discount code.
- **P0**: Rule 2 must not re-message the same customer more than once per week (anti-spam safeguard).
- **P0**: Both rules run against the `whatsapp-web.js` session exclusively — never routed through the official platform, per §6.1.
- Acceptance: a customer replying to either message reopens a standard 24h free-form conversation on whichever rail they replied on.

### 8.8 Payment Method Analytics — P0
- Every Cashier-till order carries a `payment_method` (cash | visa), rolled up into: (a) the Cashier End-of-Day report, and (b) the Owner Dashboard Nightly Digest, from a single shared source of truth (no duplicate counters to keep in sync).

### 8.9 Future Considerations — P2
- Multi-branch support (shared menu, per-branch analytics and habit rules).
- Real-time stock-on-hand ledger with purchase-order reconciliation (beyond usage/void tracking).
- Foodics write-back (push orders/menu changes, not just read analytics).
- Migrating Habit Engine to the official platform if/when template economics or approval friction change materially (see R1 mitigation).
- Card-present terminal integration for Cashier till.

---

## 9. Risks & Open Questions

| ID | Risk / Question | Impact | Owner to resolve | Status |
|---|---|---|---|---|
| **R1** | **Habit Engine runs on whatsapp-web.js, which violates WhatsApp's Terms of Service.** Meta actively detects and bans numbers running unofficial automation, with no appeal path (the number was never a real API customer). A ban takes down *only* the Habit Engine's number if isolated on its own dedicated line — but if the same number is ever reused for ordering, the whole customer channel goes down with it. | High — total loss of the automated number, no recourse | Engineering / Founder | **Accepted risk, explicit decision** (this PRD) |
| R1-mitigation | Use a **dedicated, isolated number** for the Habit Engine that is never the same number customers order through, so a ban doesn't cascade to the ordering channel. Treat the number as disposable/replaceable. | — | Engineering | Recommended, not yet implemented |
| **R2** | Review Shield's rating-based routing to Google (§8.6) is likely non-compliant with Google's and the FTC's current review-gating policies. | Medium — Business Profile suspension risk | Founder | **Resolved — keep current design as-is, risk accepted** |
| R3 | Fooder and Mottasl/Qoodz already offer WhatsApp ordering integrated with Foodics. The Has-POS track's differentiation must lean on the AI/analytics layer, not on ordering itself. | Medium — competitive positioning | Product | Acknowledged in §1/§4 |
| R4 | Foodics API access requires the café to be on an eligible plan/license and to explicitly authorize via OAuth — not automatically available for every Has-POS prospect. | Medium — sales friction for Has-POS track | Sales / Partnerships | Open |
| R5 | Recipe/material cost defaults are illustrative placeholders; real supplier pricing must replace them before any margin figure is shown to a real owner. | Low (pre-launch), High (if shipped with placeholder data) | Product | Open |
| R6 | Utility-vs-Marketing template classification for the Nightly Digest is assumed (Utility); Meta's actual review could reclassify it, changing cost. | Low | Engineering | Open, confirm at template submission |

---

## 10. Success Metrics

**Leading indicators** (move fast, check weekly during pilot):
- % of daily transactions captured through Veyrox Food (WhatsApp + Cashier combined) vs. estimated total footfall
- Habit Engine message → reply rate (proxy for re-engagement + free-window recapture)
- Owner logins to Recipe Costing tab per week

**Lagging indicators** (move slowly, check monthly):
- Net margin improvement on flagged low-margin items after owner adjusts pricing/recipes
- Repeat customer rate (from Nightly Digest) trend over 8 weeks
- Void rate as % of total orders (should stabilize, not grow — a rising trend suggests a kitchen/counter workflow problem, not a system problem)

---

## 11. Timeline / Phasing (suggested)

| Phase | Scope | Rationale |
|---|---|---|
| **Phase 1 — Core loop** | Table QR, Customer Ordering, Barista KDS | Prove the no-app ordering loop end-to-end before adding operational tooling |
| **Phase 2 — Counter + Owner visibility** | Cashier Till (incl. void/refund), Nightly Digest, Item Analytics, Review Shield | Close the walk-in gap and give the owner a reason to open the product daily |
| **Phase 3 — Margin tooling** | Recipe Costing calculator | Highest-leverage feature for owner retention; depends on Phase 2 sales data existing |
| **Phase 4 — Retention automation** | Habit Engine (whatsapp-web.js, isolated number per R1-mitigation) | Depends on having enough order history for the targeting rules to matter |
| **Phase 5 — Monetized AI layer + Has-POS track** | AI Add-Ons, Foodics read integration | Sold once Phases 1–4 are proven on the no-POS pilot |

Review Shield ships as designed in Phase 2, with the R2 risk (§9) carried forward as accepted, not blocking.

---

## 12. Appendix

- Interactive demo: `brew-baladi-demo.html` (internal codename; product-facing name is Veyrox Food)
- Visual walkthrough: Veyrox Food portfolio PDF (client-facing, 15 pages)
- All figures, prices, and customer names throughout the demo and this PRD are illustrative placeholders, not production data.
