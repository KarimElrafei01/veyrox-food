# Veyrox Food — Functional Requirements

Every PRD §8 feature decomposed into numbered, testable requirements.

**Priorities**: `P0` = pilot blocker. `P1` = GA. `P2` = post-GA.
**`[+]`** marks a requirement **added during planning** that the PRD does not contain. Each is justified in `11-prd-gap-analysis.md`. Every PRD P0 is preserved at P0.
**Traceability**: each group cites its PRD section; `AC` = acceptance criteria, written so they can be turned directly into tests.

---

## FR-1 — Store QR Entry *(PRD §8.1, scope-reduced for v1)*

> **Deliberate divergence from the PRD.** §8.1 specifies "static QR **per table**, encoding a `wa.me` deep link with a pre-filled, **table-numbered** message." **v1 ships one QR for the whole store.** Decided 2026-09-05. Rationale and consequences in `11-prd-gap-analysis.md` §DEC-01.

| ID | P | Requirement |
|---|---|---|
| FR-1.1 | P0 | **One static QR per tenant**, encoding `https://wa.me/<business_number>?text=<urlencoded greeting + store token>`. The same code is reproduced on every table tent, the counter, and the menu. There is no per-table mapping. |
| FR-1.2 | P0 | Scanning opens WhatsApp directly on the business number with the message prefilled. Total interaction: camera → tap link. |
| FR-1.3 | P0 | The prefilled text carries the tenant's `qr_token`, which identifies the **store**, not a table. An absent or unrecognized token still resolves correctly when the business number maps to exactly one tenant, and never errors — the token is a hint, not an authorization. |
| FR-1.4 | P1 | The console generates a print-ready QR sheet: one design, tiled for table tents, plus a single large version for the counter. Owners will reprint; making them ask me is an operational tax. |
| FR-1.5 | `[+]` P0 | Rotating `qr_token` invalidates the old one only after a **30-day grace period**, during which the old token still resolves and logs a warning. Physical media in the world outlives database rows — and with one code, a rotation invalidates *every* printed artifact at once, so the grace period matters more now, not less. |
| FR-1.6 | `[+]` P0 | **Order handoff is counter pickup by default.** The customer receives the "ready" ping (FR-3.2) and collects. KDS tickets are identified by order number and customer first name, which is what counter orders already required. |
| FR-1.7 | `[+]` P1 | Setting `ordering.ask_table_number`, **default off**. When enabled, the webview asks for a table number as an optional field, stored as `orders.table_label` and shown on the KDS ticket. A café that runs table service turns it on; nothing else in the system changes. |

**AC-1**: Scanning the store QR on a stock Android and a stock iPhone opens WhatsApp with the greeting prefilled, in ≤2 taps, with no manual number entry. With `ask_table_number` off, an order completes with no table prompt anywhere; with it on, the entered label appears on the KDS ticket.

---

## FR-2 — Customer Ordering (WhatsApp) *(PRD §8.2)*

### 2a. Conversation entry

| ID | P | Requirement |
|---|---|---|
| FR-2.1 | P0 | On an inbound message the bot replies with a greeting and an **Order Ahead** CTA-URL button opening the webview inside WhatsApp. |
| FR-2.2 | P0 | The webview URL carries an HMAC-signed session token binding `wa_id`, `tenant_id`, `menu_version`, and an expiry (15 min). Tokens are single-tenant, replay-safe, and never contain personal data in the clear. |
| FR-2.3 | `[+]` P0 | **Closed-store handling.** Outside `store_hours` or during a `store_closure`, the bot replies with opening time and does not offer ordering. QR codes are permanent and people scan them at 02:00. |
| FR-2.4 | `[+]` P0 | **Language.** Greeting and webview default to the tenant's `default_locale` (**`en`** — Q5, English-primary), with a one-tap toggle to `ar-EG` persisted to `customers.locale` and reused on every later visit. |
| FR-2.5 | P0 | Unrecognized free-text inside the 24h window gets a fallback reply with the CTA again, never silence. |

### 2b. Menu and cart

| ID | P | Requirement |
|---|---|---|
| FR-2.6 | P0 | Menu is categorized (Espresso / Cold Brew / Pastries / Beans) with per-category ordering, bilingual names, and prices from the **pinned menu version** for the session. |
| FR-2.7 | `[+]` P0 | Items with `is_available = false` render as visibly unavailable and cannot be added. Modifier options are independently 86-able (oat milk runs out before lattes do). |
| FR-2.8 | P0 | Per-item modifiers: size (Regular/Large), milk (Whole/Oat/Almond/Skim), ice (Cubes/Blended) where applicable, with **priced deltas applied live** in the cart. |
| FR-2.9 | P0 | Modifier groups enforce `required`, `min_select`, `max_select`. A required group with no selection blocks add-to-cart with an inline message. |
| FR-2.10 | P0 | Silver and Gold tiers get alt-milk free: the delta renders struck-through at 0, and the *server* applies the same rule at checkout. |
| FR-2.11 | P0 | Cart shows a running total, per-line modifiers, and quantity controls. Cart survives a webview reload within the token's TTL. |
| FR-2.12 | P1 | After the first item is added, a single add-on upsell prompt per session (never repeated). |
| FR-2.13 | P1 | A "frequently bought together" cross-sell screen before payment, from co-occurrence in `mv_item_sales_daily`, suppressed when there is insufficient data rather than showing a random item. |

### 2c. Checkout, ETA, loyalty

| ID | P | Requirement |
|---|---|---|
| FR-2.14 | P0 | **All pricing is recomputed server-side at order placement** from item and modifier IDs against the pinned menu version. A client-supplied price or total is ignored. Mismatch beyond rounding is rejected and logged as a potential tampering event. |
| FR-2.15 | P0 | **No payment is taken online. v1 has no payment provider** (ADR-0010). Placing an order creates it in `placed` with `payment_method = null`; the customer pays **cash on pickup**, or on the café's own card terminal recorded as the `visa` label (PRD §4 — a reconciliation label, not an integration). |
| FR-2.16 | P0 | The webview's final step states clearly, in the customer's language, that payment is made at the counter on collection. No checkout, no redirect, no external page. |
| FR-2.17 | P0 | Order status becomes paid only when a cashier records collection and a payment method at the counter (FR-4.3). There is no path by which an order becomes paid without a staff action. |
| FR-2.18 | P0 | The confirmation message contains an **ETA range** (FR-2.19), the order number, an itemized total, **"pay at the counter when you collect"**, and points to be earned on collection. |
| FR-2.19 | P0 | ETA = `prep(cart) + queue_wait`, where `prep(cart) = max(item prep) + 0.4 × Σ(other item prep)` and `queue_wait = Σ(remaining prep in Received+Preparing) / active_stations`. Displayed as a range `[0.9×, 1.25×]` rounded to 5 minutes. Live KDS queue depth is an input (PRD §8.3). |
| FR-2.20 | P0 | Loyalty accrual: 1 point per 10 EGP × tier multiplier (Bronze 1.0, Silver 1.2, Gold 1.5), appended to `loyalty_ledger` in the same transaction that records **collection and payment**. The confirmation message says "you will earn N points"; the collection message says "you earned N points." |
| FR-2.21 | P0 | Tiers: Bronze 0–150, Silver 151–500, Gold 501+. Crossing a threshold triggers an in-chat celebration message exactly once per crossing (never re-fires on re-crossing downward then upward within the same day). |
| FR-2.22 | P0 | Gold's "priority prep" perk sorts the ticket ahead of non-Gold tickets of the same status on the KDS, with a visible Gold marker so the barista understands why. |

### 2d. No-show controls `[+]` — the cost that prepayment used to carry

Removing prepayment moves the no-show risk onto the café. Three controls bound it (ADR-0010):

| ID | P | Requirement |
|---|---|---|
| FR-2.23 | P0 | **One open unpaid order per customer** (setting `ordering.max_open_orders`, default 1). A customer with an uncollected order cannot place another; the bot explains why. Bounds a single bad actor to one drink. |
| FR-2.24 | P0 | **Auto-abandon**: an order sitting in `ready` beyond `ordering.abandon_after_minutes` (default 30) transitions to `abandoned`. **Materials are NOT returned** — the drink was made and the milk is genuinely gone. It is recorded as waste, reported separately on the EOD and digest, and never counted as revenue. |
| FR-2.25 | P0 | **No-show counter**: after 3 `abandoned` orders in 90 days, the customer's WhatsApp ordering is stepped down to counter-only, with a polite message. Reversible by the owner from the Store Console. Deliberately generous — a real customer will not reach it by accident. |
| FR-2.26 | P1 | The owner sees abandoned-order count and value in the digest, so they can judge whether the thresholds are set right for their café. |

**AC-2**: An order placed end to end (menu → modifiers → confirm) produces (a) a total matching an independent hand calculation from the price and modifier tables, (b) an ETA consistent with the KDS queue at the moment of barista acceptance, (c) no material deduction until acceptance, and (d) a `loyalty_ledger` accrual matching the tier multiplier, written only when the order is collected and paid.

---

## FR-3 — Barista KDS *(PRD §8.3)*

| ID | P | Requirement |
|---|---|---|
| FR-3.1 | P0 | Four-column board: **New / Received / Preparing / Ready**, tablet-optimized, legible at arm's length (min 18px body, 28px item names, high contrast). *New* holds WhatsApp `placed` orders and Till `pending` orders awaiting kitchen acceptance (FR-3.11). This preserves the PRD's three working columns and adds the gate in front of them. A tenant with `kitchen.auto_accept` on (ADR-0024) never populates New at all — every order auto-accepts straight to Received. |
| FR-3.2 | P0 | Tapping a ticket advances it one status. Advancing to Ready auto-sends the customer a WhatsApp "order ready" message on the official rail (inside the 24h window, therefore free). |
| FR-3.3 | P0 | Status changes propagate to all connected KDS/Till clients and to the ETA calculation in **under 1 second** (PRD §8.3 acceptance). |
| FR-3.4 | P0 | Received-column depth and in-progress remaining time feed FR-2.19 in real time. |
| FR-3.5 | `[+]` P0 | Advancing an already-advanced ticket is a **no-op returning the current state**, not an error. Double-taps are the norm on a tablet with wet hands. |
| FR-3.6 | `[+]` P0 | A persistent connection indicator shows realtime health and the age of the last update. When stale beyond 10s it is unmissable — the board must never look live when it is not. |
| FR-3.7 | `[+]` P0 | Undo: a ticket can be moved back one status within 60 seconds, recorded in `order_events` with the actor. Ready messages already sent are not un-sent, but the reversal is logged. |
| FR-3.8 | P1 | Tickets show elapsed time since acceptance and turn amber past the promised ETA, red past 1.5×. |
| FR-3.9 | `[+]` P1 | A barista can mark an item unavailable directly from the KDS (86-ing it, FR-2.7), because that is where they discover it. |
| FR-3.10 | P1 | `active_stations` (barista count) is settable on the board and feeds FR-2.19. |
| FR-3.11 | `[+]` P0 | **Kitchen-accept gate.** WhatsApp `placed` orders and Till `pending` orders land in **New**. A barista taps Accept before materials are deducted, prep begins, or the ETA clock starts; Accept transitions either channel to `received`. This is the control that replaces prepayment (ADR-0010): without it, anyone with WhatsApp can make a café consume milk and barista time with no commitment. **Exception**: a tenant can opt into `kitchen.auto_accept` (ADR-0024), which performs this exact transition automatically and attributes it to `actor_type='system'`, at the owner's own risk, for both channels. |
| FR-3.12 | `[+]` P0 | A barista can **Reject** a New ticket with a reason (`too_busy`, `item_unavailable`, `closing`). Nothing was deducted, so nothing is returned; the customer gets a polite message rather than silence. Rejection is attributed and counted. An auto-accept attempt (FR-3.11) that finds an item 86'd since placement auto-rejects the same way, with `item_unavailable` (ADR-0024). |
| FR-3.13 | `[+]` P0 | New tickets show an age timer and escalate visually past 2 minutes. An unaccepted order the customer is already waiting on is worse than a rejected one. Does not apply to a tenant with `kitchen.auto_accept` on — no order waits in New long enough to escalate. |

**AC-3**: With two KDS tablets and one Till connected, advancing a ticket on one reflects on all others and in a freshly-computed ETA in <1s at p95, and survives a 30-second network drop with automatic catch-up and no lost transitions.

---

## FR-4 — Cashier Till *(PRD §8.4)*

| ID | P | Requirement |
|---|---|---|
| FR-4.1 | P0 | Flat item grid, no modifiers required, optimized for speed; a running cart with quantity controls and one-tap removal. |
| FR-4.2 | P0 | **Send to Kitchen** sets the order `pending` and places it in the KDS New column. It does **not** deduct materials. A kitchen Accept transitions it to `received` and writes `sale_deduction` rows stamped with `recipe_version_id`. Same `kitchen.auto_accept` exception as FR-3.11: when on, this transition happens automatically instead of on a barista's tap. |
| FR-4.3 | P0 | A `ready` order can be marked **Paid (Cash)** or **Paid (Visa)** on collection. **This is now the only payment path in the system**, for WhatsApp and counter orders alike (ADR-0010): recording payment also records collection, accrues loyalty, and closes the order. `visa` is a reconciliation label for the café's own terminal, never an integration; a cash-only café turns it off with `payments.methods_enabled`. |
| FR-4.4 | P0 | **Void returns exactly the materials the order deducted**, by inserting the exact negation of that order's `sale_deduction` rows (`reverses_ledger_id` set). The routine never reads `recipes`. Atomic in one transaction; auditable via `order_events` and `material_ledger`. |
| FR-4.5 | P0 | Voiding is idempotent: the partial unique index on `reverses_ledger_id` makes a double-void impossible even under concurrent requests or an application-layer idempotency failure. |
| FR-4.6 | `[+]` P0 | Voiding requires a **manager PIN** and a reason code (`customer_left`, `wrong_order`, `staff_error`, `kitchen_error`, `other`). Actor and reason are recorded immutably. Voids are the primary theft vector in F&B; an unattributed void makes the product worse than paper. |
| FR-4.7 | P0 | **End-of-Day report**: cash order count + total, visa count + total, void count, and an itemized list of raw materials returned from today's voids. |
| FR-4.7a | `[+]` P0 | Close-out captures an owner/manager `footfall_estimate`. This is the denominator PRD G1 needs and it exists nowhere else in the system. |
| FR-4.7b | `[+]` P0 | Close-out is blocked while unsynced offline actions remain, and while any order is still `pending`. The staff are shown exactly what is blocking. |
| FR-4.8 | `[+]` P1 | **Refund** for an already-paid order: records a manual cash refund (no provider to reverse, since there is no PSP), returns materials with `reason='refund_return'` **only if the order had not yet been prepared**, and claws back loyalty points. Requires a manager PIN. Much smaller in v1 than it was with prepayment, because payment and collection are now the same moment — a customer who changes their mind does so before paying. |
| FR-4.9 | P0 | The Till works **offline**: create, add items, send to kitchen. Actions queue in an IndexedDB outbox with client-generated idempotency keys and flush on reconnect. |
| FR-4.10 | P0 | **Payment marking is never optimistic.** An offline order cannot be marked Paid until the server confirms; the UI shows a distinct pending-sync state. |
| FR-4.11 | `[+]` P1 | Void anomaly detection: a nightly job flags staff whose void rate exceeds 2σ above the branch mean, or any void of a previously-paid order, and alerts the owner. |
| FR-4.12 | P1 | Reprint / re-issue a receipt for any order from today. |

**AC-4**: For any voided order, `SELECT material_id, sum(qty_delta) FROM material_ledger WHERE order_id = :id GROUP BY material_id` returns zero for every material — including when the recipe was edited between send-time and void-time — with no manual reconciliation step. Verified continuously in production by INV-1 and by property-based tests over arbitrary interleavings.

---

## FR-5 — Owner Dashboard *(PRD §8.5)*

### 5a. Nightly Digest *(§8.5.1)*

| ID | P | Requirement |
|---|---|---|
| FR-5.1 | P0 | Sent via WhatsApp at **22:00 `Africa/Cairo`** (DST-aware; a UTC schedule drifts an hour twice yearly) using an official-platform template. |
| FR-5.2 | P0 | Contents: revenue, order count, average prep time, Review Shield summary, repeat-customer rate. |
| FR-5.3 | P0 | **Cashier payment breakdown**: cash orders (count + amount) and visa orders (count + amount), from the same source as FR-4.7 — a single rollup, no duplicate counters (PRD §8.8). |
| FR-5.4 | `[+]` P0 | The digest is submitted to Meta as a **Utility** template in Sprint 6, four sprints before it is needed, so a Marketing reclassification (PRD R6) surfaces as a pricing decision rather than a launch blocker. |
| FR-5.5 | `[+]` P1 | If the send fails, the digest is retried, and on final failure the owner is alerted through a second channel. A missing digest is read as "the system is broken." |
| FR-5.6 | P1 | An LLM-generated two-sentence Arabic summary is prepended. Every number in it is computed deterministically and passed in; the model restates and never derives. Generation failure omits the prose and sends the table. |

### 5b. Item Analytics *(§8.5.2)*

| ID | P | Requirement |
|---|---|---|
| FR-5.7 | P0 | Ranked units-sold per item for the current week, with revenue and period-over-period change. |
| FR-5.8 | P0 | Raw-material usage computed as `−sum(qty_delta)` over the ledger — automatically net of voids, with no manual stock counting (PRD §8.5.2, G4). |
| FR-5.9 | `[+]` P0 | Tab views emit `console.tab_viewed{tab}` product-analytics events with a real session model, so PRD G2 ("owner opens Recipe Costing ≥3x/week") is measurable. |

### 5c. Recipe Costing *(§8.5.3)*

| ID | P | Requirement |
|---|---|---|
| FR-5.10 | P0 | Owner-editable `cost_per_unit` for every raw material. Edits **version** the cost (`valid_from`/`valid_to`); they never overwrite, so historical margins are stable. |
| FR-5.11 | P0 | Live-computed cost, price, and margin % per menu item, colour-coded: ≥70% good, 50–70% mid, <50% low. |
| FR-5.12 | P0 | Modifier-aware costing: a Large Oat Latte's cost includes the oat-milk recipe line, not the whole-milk one. |
| FR-5.13 | P0 | A running "total ingredient spend this week" figure, from ledger movements valued at the cost in force at movement time. |
| FR-5.14 | `[+]` P0 | **Any item whose recipe touches a `source='placeholder'` cost shows "cost not set" instead of a margin**, with a direct link to fix it. PRD R5 says placeholder costs must never reach a real owner; making this a rendering rule rather than a checklist item is what guarantees it. |
| FR-5.15 | P1 | "Simulate +10% [ingredient]" quick-action showing the margin impact across affected items, non-persisting. |
| FR-5.16 | P1 | Margin history sparkline per item, from snapshotted costs. |

### 5d. AI Add-Ons *(§8.5.4)*

All four are opt-in, separately priced, gated by `entitlements`, and shown with a **live preview computed from the tenant's own data** before purchase.

| ID | P | Requirement |
|---|---|---|
| FR-5.17 | P1 | **Demand Forecasting & Waste** — daily purchase list per material from a day-of-week × hour-of-day profile with EWMA level and an Egyptian holiday/Ramadan overlay. Perishables are ordered to the interval's upper bound, staples to the point estimate. Shows the interval, never a bare number. |
| FR-5.18 | P1 | **Menu Engineering** — Star/Plowhorse/Puzzle/Dog classification on (margin %, volume) against the period median. Deterministic and explainable; the owner can see exactly why an item landed where it did. |
| FR-5.19 | P1 | **Off-Peak Pricing** — discount-only suggestions, capped depth, capped hours, never below `cost × 1.15`. **Peak-hour surcharges are impossible to express in the data model**, not merely disallowed by policy (PRD §4, permanent constraint): the discount field is unsigned and validated `> 0`. |
| FR-5.20 | P1 | **Ramadan-Ready Labor Scheduling** — roster generated around the iftar demand curve, respecting staff availability and rest constraints, exportable and manually editable. |
| FR-5.21 | `[+]` P1 | Every AI output stores the deterministic payload that produced it alongside any generated prose, so an owner complaint is reconstructible months later. |

### 5e. No-POS / Has-POS toggle *(§8.5.5)*

| ID | P | Requirement |
|---|---|---|
| FR-5.22 | P0 | Switching to Has-POS surfaces a data-scope banner on the Digest and Item Analytics: *"WhatsApp-channel orders only — connect [POS] for the full picture."* |
| FR-5.23 | P0 | The same note attaches to the two volume-dependent add-ons (Forecasting, Menu Engineering). |
| FR-5.24 | P0 | Recipe Costing is unaffected by the toggle (it does not depend on sales-volume completeness). |
| FR-5.25 | `[+]` P0 | **Enforced structurally**: every panel component declares a `dataScope` prop (`complete` \| `whatsapp_only`), and the shared panel wrapper renders the banner automatically. A panel cannot omit the banner by forgetting it — the type system requires the declaration. This is how PRD §8.5.5's acceptance criterion ("no dashboard panel may present partial data as if it were complete, **under any toggle state**") becomes a compile-time guarantee rather than a review checklist. |

**AC-5**: With `pos_mode='has_pos'`, an automated sweep of every rendered console panel finds a scope banner on every volume-dependent panel and none on Recipe Costing. Margin figures match hand calculation to the piastre. No margin renders anywhere while any contributing cost is a placeholder.

---

## FR-6 — Review Shield *(PRD §8.6 — ships as specced; R2 accepted)*

| ID | P | Requirement |
|---|---|---|
| FR-6.1 | P0 | A rating request is sent 30 minutes after pickup, implemented as a BullMQ **delayed job** scheduled on transition to `collected` — not a polling cron. |
| FR-6.2 | `[+]` P0 | "Pickup" is defined as the `collected` transition. If an order never reaches `collected`, the request fires 30 minutes after `ready` and is suppressed entirely if the order was voided or refunded. The PRD leaves "pickup" undefined; without this the job either never fires or fires at the wrong customers. |
| FR-6.3 | P0 | Ratings of 1–3★ are shown a private recovery voucher and privately alert the owner. Ratings of 4–5★ are shown the public Google review link. **This is the gated design the PRD accepted (R2).** |
| FR-6.4 | `[+]` P0 | The whole behaviour sits behind a per-tenant flag `review_gating.enabled`, flippable in under 60 seconds. |
| FR-6.5 | `[+]` P0 | The compliant variant is **built and tested behind the same flag**: every customer is asked for a public review regardless of rating; only the *private owner alert* remains conditional. Switching is a config change, not a project. |
| FR-6.6 | `[+]` P0 | **The recovery voucher is never mentioned in the same message as a public-review ask.** Incentivized reviews are a materially worse violation than gating and would compound R2's exposure. Enforced by template separation and a test. |
| FR-6.7 | `[+]` P0 | Every request records `rating`, `routed_to`, and `gating_enabled_at_send` immutably, so the behaviour is fully reconstructible if the risk materializes. An accepted risk that cannot be audited is an unbounded risk. |
| FR-6.8 | P0 | Owner alerts for low ratings are delivered immediately, not batched into the digest (PRD user story: *"know immediately if a customer left a bad rating"*). |

---

## FR-7 — Habit Engine *(PRD §8.7 — whatsapp-web.js only)*

| ID | P | Requirement |
|---|---|---|
| FR-7.1 | P0 | **Rule 1 — Morning re-order nudge**: 08:15 Cairo daily; targets customers with ≥3 orders in the 08:00–09:00 window over the last 7 days; sends a one-tap re-order for their usual item. |
| FR-7.2 | P0 | **Rule 2 — Win-back**: 21:00 Cairo daily; targets regulars (≥3 orders in 14 days) whose most recent order is **2–3 days old inclusive** (a closed window, not open-ended); sends a check-in with a one-time 10% code. |
| FR-7.3 | P0 | Rule 2 must not message the same customer more than once per week. Enforced by a query against `outbound_messages` **and** asserted continuously by INV-5. |
| FR-7.4 | P0 | Both rules run exclusively on the whatsapp-web.js rail. `habit_rules.channel` carries a CHECK constraint; routing a habit message through the official rail is rejected at the database. |
| FR-7.5 | `[+]` P0 | **Opt-out**: every habit message carries a stop instruction; a `STOP` / `توقف` reply writes `customer_suppressions` and is honoured by **both** rails, permanently. Required by PDPL regardless of the ToS position. |
| FR-7.6 | `[+]` P0 | Discount codes are single-use, customer-bound, expiring, and carry `habit_run_id`, so PRD G3 (win-back → order ≥8%) is measurable by joining redemption back to the exact send. |
| FR-7.7 | `[+]` P0 | Replies within 24h of a habit send are correlated to that send and counted in `habit_runs.replies_24h`, making PRD G5 (≥40% reply rate) measurable. |
| FR-7.8 | `[+]` P0 | Send behaviour is deliberately conservative: global daily cap, per-hour rate limit, randomized inter-message jitter, and a hard stop outside 08:00–21:00 Cairo. |
| FR-7.9 | `[+]` P0 | **Kill switch**: one flag halts all habit sending within 60 seconds, verified end-to-end before M4. |
| FR-7.10 | `[+]` P0 | Session health is probed every 5 minutes. On auth failure the worker **freezes and alerts — it does not auto-reconnect**, because reconnect storms raise ban probability. |
| FR-7.11 | `[+]` P0 | A second `HabitChannel` implementation against the official Cloud API is fully built, with templates **submitted to and approved by Meta before M4**, sitting unused. Migration on ban is a flag flip. |
| FR-7.12 | P0 | The habit worker reads only `vw_habit_targets` under the `habit_reader` role and can write nothing. Outcomes are reported back through a narrow mTLS endpoint. |

**AC-7**: A customer replying to either message reopens a standard 24h free-form conversation on the rail they replied on. A customer messaged by Rule 2 on Monday is not messaged again before the following Monday, proven by test and asserted in production by INV-5. Flipping `habit_engine.enabled` to false stops all sending within 60s.

---

## FR-8 — Payment Method Analytics *(PRD §8.8)*

| ID | P | Requirement |
|---|---|---|
| FR-8.1 | P0 | Every paid order carries `payment_method` (cash \| visa), rolled up into both the EOD report (FR-4.7) and the Nightly Digest (FR-5.3) **from a single shared query in `packages/domain`** — no duplicate counters to keep in sync (PRD §8.8). |
| FR-8.2 | P0 | Totals are **broken down by channel** (whatsapp \| cashier) as well as by method, so the owner can see how much of the day came through WhatsApp. With no online payment, channel is the only thing that distinguishes them. |
| FR-8.3 | `[+]` P1 | Voided, refunded, rejected, and **abandoned** orders are excluded from payment totals and reported separately — abandoned as **waste**, with its material cost. Netting any of them silently into revenue is the single most common source of "the numbers don't match the drawer." |

---

## FR-9 — Cross-cutting `[+]`

| ID | P | Requirement |
|---|---|---|
| FR-9.1 | P0 | **Localization**: English (`en`, default per Q5) and Arabic (`ar-EG`) throughout — customer webview, WhatsApp messages, Till, KDS, both consoles — with correct **RTL layout, icon mirroring, and bidi-safe numerals** when Arabic is selected. `name_en` is required on menu content; `name_ar` is optional but falls back to `name_en` rather than rendering blank. RTL stays P0 even though English is the default: the pilot is in Cairo, Arabic is offered, and retrofitting RTL into five SPAs costs 3–4x (GAP-01). |
| FR-9.2 | P0 | **Idempotency**: every mutating endpoint accepts and enforces an `Idempotency-Key`; a replay returns the original response. |
| FR-9.3 | P0 | **Audit**: every price change, recipe change, cost change, flag flip, and staff change writes `audit_log` with actor and before/after. |
| FR-9.4 | P0 | **Feature flags**: DB-backed, global or per-tenant, readable by all services with a ≤30s propagation, flippable from a phone. |
| FR-9.5 | P0 | **Safe mode**: a single flag reducing the product to take orders / show tickets / record payments, disabling every optional surface. |
| FR-9.6 | P1 | **Tenant onboarding** is self-service enough that café #2 and #3 require zero code changes — an M5 gate. |
| FR-9.7 | P1 | **Data export**: the owner can export orders, items, and material movements as CSV for their accountant. |
| FR-9.8 | P2 | **E-invoicing-shaped receipts**: receipt records carry the fields Egypt's e-receipt regime needs — tax registration number (a per-café setting the owner enters), item tax codes, document UUID — so Wave 9/10 submission is a v2 integration rather than a re-model. **No submission in v1** (Q3, closed 2026-09-06). The fields exist from day one because backfilling them onto historical receipts is the expensive version. *Not to be confused with ETA, which in this document always means the customer's estimated time of arrival (FR-2.19).* |

---

## FR-10 — Store Console: configuration & CRUD `[+]`

Spec: `13-admin-and-configuration.md` §4. Everything here is added scope — the PRD's §8.5 describes an analytics dashboard only, and never says how a café changes its own menu.

### 10a. Configuration

| ID | P | Requirement |
|---|---|---|
| FR-10.1 | P0 | Every behaviour resolves through **platform capability → tenant entitlement → tenant preference**, in that order, via one `resolveFeature()` in `packages/domain`. Clients receive **resolved state with a reason**, never raw flags. |
| FR-10.2 | P0 | `setting_definitions` is the registry of every configurable key: layer, type, bounds, default, `owner_editable`, and a one-sentence description in Arabic and English. **A key with no definition row cannot be set by anyone**; a bounded key cannot be pushed past its bounds by either console. |
| FR-10.3 | P0 | The owner-configurable surface is an **allowlist** (§3 of the spec): ordering, menu, kitchen, loyalty, discounts, digest, Review Shield on/off, habit rules within platform bounds, add-ons subject to entitlement, store, people, notifications. |
| FR-10.4 | P0 | The following are **not owner-configurable**: review gating, the habit rail channel, void authorization, retention floors, rate limits and quiet-hour maximums, their own audit log, and anything in the correctness machinery. Enforced by `owner_editable`, not by omitting a UI control. |
| FR-10.5 | P0 | Fail-safe resolution: if the flag store is unreachable, last-known-good cache applies; with no cache, the conservative default applies — **off for everything optional, on for the ordering critical path**. |
| FR-10.6 | P1 | A one-action "restore defaults" per settings section, so an owner cannot configure themselves into an unrecoverable state. |

### 10b. Menu, recipes, materials — versioned CRUD

| ID | P | Requirement |
|---|---|---|
| FR-10.7 | P0 | Full CRUD on categories, items, modifier groups, and modifier options. |
| FR-10.8 | P0 | **Edits to prices, recipes, and material costs create versions**; they never overwrite (FR-5.10, `04-data-model.md` §1). The owner never sees the word "version" — the UI states the consequence: *"New price applies to new orders. Past orders and reports keep the old price."* |
| FR-10.9 | P0 | The recipe editor states, on save: *"Applies from now on. Orders already in the kitchen will still return their original quantities if voided."* This is the ledger design made visible and is the product's best moment to earn belief in its numbers. |
| FR-10.10 | P0 | **Delete is archive.** An item, modifier, or material with any history is archived (`active=false`), never hard-deleted; sales history and report drill-downs stay intact. |
| FR-10.11 | P0 | Archiving a material referenced by an active recipe is **blocked**, listing the recipes that use it. |
| FR-10.12 | P0 | **Menu draft & publish**: edits stage in a `menu_revision`, publish atomically as one new `menu_version` inside one transaction. In-flight customer sessions keep their pinned version until it expires. A **diff view with per-change margin impact** precedes publish. |
| FR-10.13 | P0 | Publish is blocked, with the specific reason, if the draft would leave an active item without a price, a recipe referencing an archived material, or a required modifier group with no options. |
| FR-10.14 | P0 | **Availability (86-ing) bypasses the draft** and applies instantly (FR-2.7). |
| FR-10.15 | P0 | Material cost edits show an **impact preview before saving** ("this changes the margin on 14 items") and the recomputed margins after. This is the rail that catches a mistyped per-gram decimal before it silently rewrites every margin. |
| FR-10.16 | P0 | Recipe lines support `modifier_option_id` so modifier-specific costs are editable (FR-5.12). |
| FR-10.17 | P0 | A **recipe library** of common café preparations seeds a new tenant, so onboarding is "adjust 40 recipes" rather than "enter 40 recipes." |
| FR-10.18 | P1 | CSV import and export for menu items, materials, and recipes, with a **dry-run diff** and per-row validation before commit. |

### 10c. Store, people, and status

| ID | P | Requirement |
|---|---|---|
| FR-10.19 | P0 | CRUD on store hours, closures, receipt header/footer, and default locale; plus **store QR download and regeneration**, honouring the 30-day grace of FR-1.5. Regeneration warns that every printed copy must be replaced, since there is now one code rather than a per-table set. |
| FR-10.20 | P0 | CRUD on staff (roles, PIN reset) and devices (enrollment, revocation). Revoking a device preserves its queued offline actions for flush on re-enrollment. |
| FR-10.21 | P0 | **Roles within a store**: Owner (everything), Manager (availability, recipes, staff PINs, voids, EOD — **not** prices, costs, plan, or roles), Cashier/Barista (Ops app only). Prices and costs are owner-only because they are the two fields that move money. |
| FR-10.22 | P0 | A **system status panel** in plain language: WhatsApp ordering, payments, kitchen display, retention messages — each Working / Degraded / Paused, with what still works and what to do. Sourced from the same health checks that drive alerting. |
| FR-10.23 | P0 | A read-only audit log for the owner, **including every platform action taken on their tenant** (FR-11.14). |
| FR-10.24 | P1 | A guided onboarding checklist (store → hours → menu → materials → **real costs** → recipes → tables/QR → staff → devices → test order) with tracked progress. |

**AC-10**: A café owner adds a seasonal item with a modifier and a recipe, prices it, reviews the diff, publishes, and sees it live in the customer webview — with no involvement from Veyrox, and with last month's margin report byte-identical before and after (NFR-19).

---

## FR-11 — Platform Admin `[+]`

Spec: `13-admin-and-configuration.md` §5. Separate deployable and auth realm per ADR-0014.

| ID | P | Requirement |
|---|---|---|
| FR-11.1 | P0 | Auth: **mandatory WebAuthn hardware key, no password fallback**, 4-hour sessions, no "remember me". |
| FR-11.2 | P0 | **Platform roles** from day one: `platform_owner`, `platform_support`, `platform_engineer`, scoped per §8 of the spec. |
| FR-11.3 | P0 | `reason` is a **required schema field on every admin mutation**. An unaudited platform change is not expressible. |
| FR-11.4 | P0 | **Every mutating admin action has a CLI equivalent** sharing the same domain functions — because the console is the mechanism for flipping `safe_mode`, and a kill switch reachable only through a web app has failed when the incident is a bad deploy. |
| FR-11.5 | P0 | **Tenant provisioning in one action**: tenant, owner user, WhatsApp number mapping, default flags and entitlements, seeded recipe library and holiday calendar. No SQL, no code change. This is the M5 gate. |
| FR-11.6 | P0 | Tenant lifecycle `prospect → provisioning → onboarding → active → suspended → churned`, with onboarding-checklist progress visible per tenant. |
| FR-11.7 | P0 | **Suspension is graceful and non-destructive**: ordering stops with a configured message, the Till goes read-only, data is retained, reversible in one action. |
| FR-11.8 | P0 | **Global kill switches** — `safe_mode`, `review_gating`, `habit_engine`, `whatsapp_ordering`, `ai_addons` — flippable in under 60 seconds from a phone, with reason, audited, and broadcast to affected tenants' status panels. |
| FR-11.9 | P0 | Per-tenant flag overrides and percentage rollout by tenant hash. |
| FR-11.10 | P0 | **Entitlement management** with four states: `none` (upsell + live preview from the tenant's own data), `preview` (read-only, watermarked, capped), `active`, `suspended` (billing message, not an upsell). Preview and paid run the **same computation**. |
| FR-11.11 | P0 | **Rails control**: official-rail number registry, quality rating, template registry with approval status and category (the R6 early-warning surface), and template spend per tenant; habit-rail session health, caps, suppression size, ban log, plus **Freeze** and **Channel switch** — the operational expression of the R1 escape hatch (ADR-0003, RB-8). |
| FR-11.12 | P0 | **Fleet health**: open INV-1..INV-6 violations across all tenants as the top item, plus job success, queue depth, and SLO burn. |
| FR-11.13 | P0 | **Support tooling**: order lookup by number/phone/trace → full timeline, ledger movements, payments, and messages in one screen; message log; one-click payment reconciliation calling the **idempotent job**, never a manual capture; a ledger inspector for diagnosing INV-1 without touching data (RB-3). |
| FR-11.14 | P0 | **Impersonation**: read-only by default; write requires escalation with a mandatory reason and a **30-minute hard time-box**; a persistent banner on every screen; attributed as `platform_user` with `impersonating_tenant_id`, never disguised as the owner; **visible in the tenant's own audit log**; and **never able to void, refund, or change a price, cost, or plan**. |
| FR-11.15 | P0 | **No UI path to tenant deletion.** CLI only, with a 7-day soft-delete window and a backup-verification step. |
| FR-11.16 | P0 | Destructive-operation rails per §7 of the spec: typed confirmation for suspension, impact previews, referential blocks, reversibility. |
| FR-11.17 | P1 | **Billing and usage**: subscription and add-on state, orders processed, template spend, LLM spend against the NFR-50 cap, PSP volume, gross margin per tenant. **Invoicing is manual** at this stage; automated recurring billing is triggered at ~20 tenants or when add-on revenue exceeds subscription revenue. |
| FR-11.18 | P1 | **Compliance operations**: DSR queue across tenants, retention-run results, review-gating posture per tenant with the fleet-wide switch and exportable audit trail (RB-9), and the R1 ban log. |
| FR-11.19 | P1 | Content management: message templates, Egyptian holiday calendar, recipe library, locale strings. |
| FR-11.20 | P0 | `platform_audit` is append-only, carries actor/action/target/reason/before/after, and is readable by all platform roles. |

**AC-11**: A new café is provisioned, entitled to one add-on in `preview`, onboarded through the checklist, and taken live — entirely from the Admin console, with no SQL and no deploy. Flipping `review_gating` off globally takes under 60 seconds and cannot be re-enabled by any owner.

---

## Traceability summary

| PRD § | Requirements | PRD § | Requirements |
|---|---|---|---|
| §8.1 Store QR *(scope-reduced)* | FR-1.1 – 1.7 | §8.5.4 AI add-ons | FR-5.17 – 5.21 |
| §8.2 Ordering | FR-2.1 – 2.22 | §8.5.5 POS toggle | FR-5.22 – 5.25 |
| §8.3 KDS | FR-3.1 – 3.10 | §8.6 Review Shield | FR-6.1 – 6.8 |
| §8.4 Till | FR-4.1 – 4.12 | §8.7 Habit Engine | FR-7.1 – 7.12 |
| §8.5.1 Digest | FR-5.1 – 5.6 | §8.8 Payment analytics | FR-8.1 – 8.3 |
| §8.5.2 Item analytics | FR-5.7 – 5.9 | §8.9 Future (P2) | Out of scope; schema is forward-compatible |
| §8.5.3 Recipe costing | FR-5.10 – 5.16 | (none — added) | FR-9.1 – 9.8 |
| (none — added) | FR-10.1 – 10.24 Store Console config & CRUD | (none — added) | FR-11.1 – 11.20 Platform Admin |

All 12 PRD user stories (§7) are covered: customer QR→FR-1; modifiers→FR-2.8; ETA-before-pay→FR-2.18/19; instant points→FR-2.20; lapsed nudge→FR-7.2; barista one-tap→FR-3.2; auto-ready-notify→FR-3.2; fast walk-in→FR-4.1; void→FR-4.4; EOD→FR-4.7; material usage→FR-5.8; true margin→FR-5.11; immediate bad-rating alert→FR-6.8; partial-data warning→FR-5.22/25.
