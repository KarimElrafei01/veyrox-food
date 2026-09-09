# Veyrox Food — Google Stitch Design Prompts

Prompts for generating every screen of Veyrox Food in **Google Stitch** (stitch.withgoogle.com).
Derived from `veyrox-food-prd.md`, `02-functional-requirements.md`, `00-master-plan.md`,
`13-admin-and-configuration.md`, and `03-non-functional-requirements.md`.

Screens are visual first drafts to hand to the visual designer engaged before S1
(`12-team-and-operating-model.md` §9). They are **not** the production design system.

---

## 0. How to drive Stitch (best practices)

Sources: Google Labs Stitch blog, aitoolsay Stitch prompt guide, 0xminds Stitch guide,
UX Planet, Codecademy Stitch tutorial (links at end).

1. **Mode.** Use **Experimental / Pro (Gemini 2.5 Pro)** for these — it accepts reference
   images (upload the WhatsApp in-app-browser chrome, a $150 Android tablet photo, competitor
   KDS screenshots) and produces denser layouts. **Standard / Flash** is text-only; fine for
   quick exploration but weaker on the data-heavy console screens. Pro caps ~400 gens/month.
2. **One screen per generation.** Never ask for a flow. Generate a screen, then refine it.
3. **One change per refinement prompt.** "On the cart screen, make the tier badge smaller" —
   not five edits at once. Stitch treats a broad instruction as licence to redraw the whole screen.
4. **Prompt length ceiling ~5,000 characters.** Past that Stitch silently drops components.
   Every prompt below is written to sit well under it. Do not paste two screen prompts together.
5. **Workflow:** (a) paste the Foundation block once to set global style, (b) generate each
   screen from its prompt, (c) refine screen-by-screen, (d) do colour/type/spacing polish last,
   (e) export to Figma/code for the designer.
6. **Colour & type:** give Stitch explicit hex + font names (below). Also give it the *mood*
   adjectives — it uses both. For dense tables, expect to hand-correct columns regardless.
7. **Device context matters** — always state "mobile 390px", "tablet landscape 1280×800",
   or "desktop web 1440px" in the prompt. Stitch defaults to mobile otherwise.
8. **RTL:** Stitch is weak at Arabic RTL. Generate each screen in **English LTR first**, then
   add one refinement prompt: *"Produce an Arabic (RTL) version of this exact screen: mirror
   the layout, right-align text, move the nav to the right, keep Western Arabic numerals."*

---

## 1. Foundation block — paste once at the start of a Stitch project

> **Product:** Veyrox Food — a WhatsApp-native operating system for independent Egyptian cafés
> (ordering, kitchen display, counter till, owner analytics). Pilot: a café in Zamalek, Cairo.
>
> **Personality:** calm, trustworthy, operational, unfussy. This is a tool people use during a
> 20-minute morning rush on cheap tablets and cheap phone data — clarity and legibility beat
> decoration every time. Warm but not playful. Think "well-run café back office", not "startup dashboard".
>
> **Bilingual:** every screen must work in Arabic (ar-EG, RTL) and English (LTR). Left/right
> layouts must be mirror-safe. Use Western Arabic numerals (0–9) for prices and counts.
>
> **Colour (placeholder palette — will be replaced by the design system):**
> - Background `#FAF8F5` (warm off-white), surface `#FFFFFF`, hairline border `#E7E2DA`
> - Ink `#1F1B16` primary text, `#6B6157` secondary text
> - Brand / primary action `#0F6E4E` (deep coffee-leaf green)
> - Accent `#C8622D` (roasted orange) — used sparingly, for highlights only
> - Status: good `#1E7A46`, warning `#B7791F`, danger `#C02B2B`, info `#2563A8`
> - Margin colour bands: ≥70% green `#1E7A46`, 50–70% amber `#B7791F`, <50% red `#C02B2B`
>
> **Type:** UI font **Inter** (Latin) + **IBM Plex Sans Arabic** (Arabic). Numbers tabular.
> Generous line-height. Body 16px on web, **18px minimum on tablet apps, 28px for item names**.
>
> **Components:** rounded 10px corners, soft 1px borders over shadows, 44×44px minimum touch
> targets, high contrast (≥4.5:1), visible focus rings. Tailwind-style spacing scale.
>
> **Accessibility:** WCAG 2.2 AA. Tablet screens must stay legible in direct sunlight — high
> contrast, no thin grey-on-white text, no colour as the only signal.

There are **five separate apps**. Keep each visually distinct but from one family:

| App | Device | Users | Note |
|---|---|---|---|
| Order webview | Mobile 390px, inside WhatsApp's in-app browser | Customers | Fastest, lightest. No app chrome — it opens inside a chat. |
| Ops (KDS + Till) | Tablet landscape 1280×800, ~$150 Android | Baristas, cashiers | Big touch targets, glanceable, offline-tolerant. |
| Store Console | Desktop web 1440px (tablet-friendly) | Café owner / manager | Calm back-office. Data + forms. |
| Platform Admin | Desktop web 1440px | Veyrox operator | **Deliberately louder/darker chrome** so it's never mistaken for the Store Console. |

---

## 2. Order Webview (customer, mobile, RTL-capable)

**Delivery decision (confirmed 2026-09-06):** the ordering UI is a **CTA-URL webview** — a real
web app (`code/frontends/order`, React SPA) opened in WhatsApp's in-app browser from an "Order Ahead"
button in the chat. **Not** WhatsApp Flows (fixed component set, no custom styling, a server
round-trip for every computed change) and **not** a standalone website (loses the phone-number
identity and the free 24h messaging window). Matches ADR-0003.

**What is a webview vs a chat message — design them differently:**
- **Webview (screens 2.1–2.9):** full HTML/CSS/JS, your styling, instant client-side cart math.
  Design these freely.
- **Chat bubbles (2.10 tier-up, and the digest in 5.16):** real WhatsApp messages. You do *not*
  style these — plain text, `*bold*`, one emoji-friendly block, max 3 buttons, templates outside
  the 24h window. Treat those mockups as copy/layout references only.

**Frame the webview realistically:**
- Do **not** draw the WhatsApp chat header (`‹ Café ☆ 👤 ⋮`). When the webview opens it covers
  the screen. On top sits WhatsApp's in-app-browser chrome — a close (✕), the page title, a
  share/⋮ menu — which you cannot style and which differs on iOS vs Android.
- Design only the content area. Assume ~50–90px of non-controllable chrome at the top and a
  possible browser toolbar (~44px) at the bottom. Sticky bottom CTAs need safe-area padding or
  they get covered (worst on iOS).
- Your own header (tier chip, ع/EN toggle) lives *inside* the page, below that browser bar.
- No login, no reliable persistent storage: auth is the HMAC-signed token in the URL (15 min);
  cart survives reload only within that TTL.
- Copy: payment is **cash on pickup or the café's own card terminal (recorded as a `visa`
  label)** — no online payment, no "InstaPay/Card" checkout (ADR-0010, FR-2.15).

Foundation for this app: *Mobile 390px width, rendered inside WhatsApp's in-app browser below
a browser chrome bar the page does not control. No hamburger, no bottom tab bar — one focused
task. Thumb-reachable primary actions pinned above the safe-area inset. Fast, minimal, image-light.*

### 2.1 Menu browse
> Café ordering menu screen, mobile 390px, opened inside WhatsApp. Top: small café name
> "Brew & Baladi", a language toggle (ع / EN), and a loyalty tier chip showing "Silver · 320 pts".
> Horizontally scrollable category tabs: Espresso, Cold Brew, Pastries, Beans. Below, a vertical
> list of menu item cards: thumbnail, name (Arabic + English), short description, price in EGP,
> "Add" button. One card shows a greyed-out "Unavailable today" state with the Add button disabled.
> Sticky bottom bar: "View cart · 2 items · EGP 145". Calm, warm, generous spacing.

### 2.2 Item detail with modifiers
> Menu item customization screen, mobile. Item image, name, description, base price. Modifier
> groups as labelled sections: "Size" (Regular / Large, radio, "+EGP 15" on Large), "Milk"
> (Whole / Oat / Almond / Skim, radio — Oat and Almond show "+EGP 12" but struck through and
> shown as "Free" because this customer is Silver tier), "Ice" (Cubes / Blended, radio).
> A required group with no selection yet shows an inline red hint "Please choose a size".
> Running item total updates live at the bottom: "EGP 82". Quantity stepper. Sticky bottom
> button "Add to cart · EGP 82".

### 2.3 Cart
> Cart / order review screen, mobile. List of line items, each showing name, chosen modifiers
> as small grey sub-text, quantity stepper, line price, remove (X). Running subtotal. A subtle
> note: "You'll earn 18 points on collection." Sticky bottom primary button "Review order".
> No promo code field, no payment fields.

### 2.4 Upsell prompt (P1)
> A single non-blocking upsell card that appears once after the first item is added, mobile.
> "Add a pastry? Butter croissant — EGP 45" with a small image, an "Add" button and a "No
> thanks" dismiss. Styled as a gentle inline suggestion inside the cart, not a modal.

### 2.5 Cross-sell screen (P1)
> "Frequently bought together" screen shown before confirmation, mobile. Two or three suggested
> items as compact cards with Add buttons, header "People also order". A clear "Skip" link.
> If there were no data this screen would not show — design the populated state only.

### 2.6 Confirm & place order
> Final order confirmation screen, mobile, inside WhatsApp. Order summary (items + total
> "EGP 145"). A prominent, reassuring panel: "Pay at the counter when you collect. Cash, or
> card on the café's terminal." Estimated time shown as a range chip: "Ready in 8–12 min".
> "You'll earn 18 points." Big sticky bottom button "Place order". No redirect, no card form.

### 2.7 Order placed / live status
> Order status screen, mobile. Large order number "#A-27", customer first name, a simple
> horizontal progress tracker: Placed → Accepted → Preparing → Ready. Currently on "Preparing".
> ETA range "Ready ~8:42–8:46". Reminder line: "Pay at the counter on collection · EGP 145".
> Below, the itemised order, collapsible.

### 2.8 Closed-store state
> Full-screen empty state, mobile: a calm illustration, "Brew & Baladi is closed right now",
> "Opens today at 8:00 AM". No ordering controls. A single "See the menu" secondary link.

### 2.9 Open-order block state
> Full-screen informational state, mobile: "You already have an order waiting — #A-27." Short
> explanation: "Collect and pay for it first, then you can order again." A "View my order" button.

### 2.10 Tier-up celebration
> A celebratory modal over the confirmation screen, mobile: confetti-light, warm. "You're now
> Silver!" with the new perks listed: "1.2× points · free oat & almond milk". One "Nice" button.

---

## 3. Ops app — Barista KDS (tablet landscape)

Foundation for this app: *Tablet landscape 1280×800 on a cheap Android tablet, viewed at
arm's length, sometimes in sunlight. Minimum 18px body / 28px item names, 44px+ targets, very
high contrast, dark-on-light. No tiny icons. A persistent connection/health strip is always visible.*

### 3.1 KDS board
> Kitchen display board, tablet landscape. Four equal columns left-to-right: **New**, **Received**,
> **Preparing**, **Ready**. Each column has a header with a count badge. Tickets are large cards:
> order number + customer first name in big bold type, item list with modifiers, an age timer
> (mm:ss), channel icon (WhatsApp vs Till). One "New" card is highlighted amber with "Waiting
> 2:14 — accept" and shows **Accept** and **Reject** buttons. Preparing cards past ETA turn
> amber, well past turn red. Gold-tier tickets show a small "Priority" marker. Top strip:
> "Connected · updated 2s ago" in green, plus an "Active stations: 2" stepper. Tap a ticket to
> advance it one column.

### 3.2 Accept / reject a new ticket
> A focused card state on the KDS for a New WhatsApp order, tablet. Full ticket detail: number,
> name, items with modifiers, placed time. Two large buttons: green **Accept** (full width) and
> a secondary **Reject**. Tapping Reject reveals reason chips: "Too busy", "Item unavailable",
> "Closing". Note under Accept: "Materials are deducted and the timer starts when you accept."

### 3.3 Stale-connection state
> The KDS board with a lost realtime connection, tablet. The top strip is now a bold red banner
> across the full width: "Not connected — last update 38s ago. Tickets may be missing." The
> board behind is dimmed slightly but still readable. A "Retry" button in the banner.

### 3.4 Ticket detail + undo
> A single expanded ticket over the board, tablet. Large item breakdown, elapsed time, current
> status. Buttons: "Move back one step" (enabled, with sub-text "available for 47s"), "Mark
> notified" state shown if the Ready message was already sent. Close (X).

### 3.5 86 an item from the KDS
> A quick "mark unavailable" panel slid in from the side, tablet. Search box, list of menu
> items with toggles, one already toggled off showing "Off since 8:15 — auto-returns at close".
> A short line: "This hides it from customers immediately."

---

## 4. Ops app — Cashier Till (tablet landscape)

Same device foundation as §3.

### 4.1 Order entry
> Cashier till order-entry screen, tablet landscape. Left ~65%: a flat grid of large item
> buttons grouped by category tabs (no modifiers — speed first), each button showing name +
> price. Right ~35%: the running cart — line items with quantity steppers and one-tap remove,
> subtotal, and a big primary button "Send to Kitchen". A small note: "Kitchen acceptance starts preparation and deducts materials. Payment is taken on collection." Secondary "Hold" and "Clear" actions.

### 4.2 Pending orders
> Pending / open orders screen on the till, tablet. A list or grid of order cards, each: order
> number, customer or "Walk-in", items summary, total, time since sent, status chip "Pending".
> Pending cards state "Awaiting kitchen acceptance" and offer Reject; accepted/ready cards expose the appropriate Prepare, Paid — Cash, Paid — Visa, and Void actions. A cash-only café would not show Visa — design the both-methods version. Top filter: All / Pending / Received / Paid today.

### 4.3 Void modal
> Void-order modal over the till, tablet. Header "Void order #C-14". Shows what will be returned:
> "Returns to stock: 18g beans, 150ml milk — exactly what this order used." A **manager PIN**
> numeric entry. Required reason as radio chips: "Customer left", "Wrong order", "Staff error",
> "Kitchen error", "Other". Confirm button disabled until PIN + reason present. Cancel.

### 4.4 End-of-Day report & close-out
> End-of-day close-out screen on the till, tablet. Summary cards: Cash — count + EGP total;
> Visa — count + EGP total; Voids — count; Abandoned (waste) — count + material cost. Below, an
> itemised list "Materials returned from today's voids". A field: "Footfall estimate (roughly
> how many customers today?)" numeric. Big "Close the day" button. If blocked, show a red
> panel: "Can't close yet: 1 order still pending, 2 actions waiting to sync."

### 4.5 Offline / pending-sync state
> The till order-entry screen while offline, tablet. A persistent amber strip: "Offline — orders
> are saved on this tablet and will sync when you reconnect." One cart line shows a small
> "pending sync" clock badge. The "Paid" buttons on a pending offline order are disabled with
> sub-text "Can't take payment until synced".

### 4.6 Refund (P1)
> Refund modal for an already-paid order, tablet. "Refund order #C-09 — EGP 120 cash". Manager
> PIN. A checkbox "Order was not yet prepared — return materials" (only then are materials
> returned). Note: "Points earned on this order will be removed." Confirm / Cancel.

---

## 5. Store Console (owner, desktop web)

Foundation for this app: *Desktop web 1440px, works down to tablet. Left sidebar nav:
Today, Analytics, Costing, Menu, Recipes, Materials, Store, People, Marketing, Add-ons,
Settings, Account. Calm warm back-office. Tables with clear hierarchy, generous rows,
inline help text written for a non-technical café owner. Never shows the word "version".*

### 5.1 Today
> Store Console "Today" overview, desktop web. Top row of stat cards: Revenue today, Orders,
> Avg prep time, Repeat-customer rate. A live mini board: New / Preparing / Ready counts. An
> alerts panel: "1 low rating needs a reply". A **System status** panel in plain language:
> "WhatsApp ordering — Working · Payments — Working · Kitchen display — Working · Retention
> messages — Paused by Veyrox" with coloured dots. Sidebar nav visible.

### 5.2 Item Analytics
> Item analytics screen, desktop web. A ranked table of menu items this week: item, units sold,
> revenue, change vs last week (▲▼). Alongside, a "Raw material usage" table: material, quantity
> used, computed automatically. If the café is in "Has POS" mode, a blue info banner spans the
> top: "WhatsApp-channel orders only — connect your POS for the full picture." Period selector.

### 5.3 Recipe Costing
> Recipe costing screen, desktop web. A table: menu item, cost, price, **margin %** with a
> coloured pill (green ≥70%, amber 50–70%, red <50%). One row instead shows "Cost not set —
> fix" as a link because a material still has a placeholder price. A header figure: "Ingredient
> spend this week: EGP 4,120". A per-item "Simulate +10% [milk]" quick action showing the
> before/after margin. No banner here (costing is unaffected by the POS toggle).

### 5.4 Menu — list & draft
> Menu management screen, desktop web. Left: categories list, reorderable. Main: items in the
> selected category as rows (name, price, availability toggle, status). A yellow "Draft" bar at
> the top: "You have 3 unpublished changes — Review & publish". "Add item" button. An item
> toggled unavailable shows "Off — customers can't order this" and a note "Availability changes
> apply instantly, no publish needed".

### 5.5 Menu item editor
> Menu item editor panel, desktop web. Fields: name (Arabic + English), category, description,
> image, price. Modifier groups section: add group, set required / min / max, add options with
> price deltas. On changing the price, an inline sentence appears: "New price applies to new
> orders. Past orders and reports keep the old price." Save / Cancel.

### 5.6 Menu draft diff & publish
> "Review & publish menu changes" screen, desktop web. A change list: each row = what changed
> (e.g. "Latte price EGP 70 → 75", "New item: Iced Spanish Latte", "Almond Croissant archived"),
> with a **margin impact** column (margin ▲/▼ n%). If publish is blocked, a red panel lists the
> reasons: "Iced Spanish Latte has no price". Buttons: "Publish all" (primary), "Discard draft".

### 5.7 Recipes editor
> Recipe editor for one menu item, desktop web. A table of ingredient lines: material, quantity,
> unit, line cost — live. Some lines are tagged "for: Oat milk" (modifier-conditional). Below
> the table, live totals: item cost, current price, **margin** with colour band. One line has a
> red "placeholder cost" flag with "set real cost" link. A side panel "Recipe library" lets the
> owner start from a standard prep (Espresso, Cortado, Cold brew). On save: "Applies from now
> on. Orders already in the kitchen will still return their original quantities if voided."

### 5.8 Materials & cost edit
> Raw materials screen, desktop web. Table: material, unit, current cost per unit, source
> (real / placeholder), last changed. Editing a cost opens a panel with an **impact preview**:
> "This changes the margin on 14 items" and a small before/after list of the most affected
> items. "Past reports are unaffected." Save / Cancel.

### 5.9 Store settings
> Store settings screen, desktop web. Sections: Opening hours (per-day time ranges), Closures &
> holidays (date list, add), **Store QR** (a large QR preview, "Download print sheet" and
> "Regenerate" — regenerate shows a warning "Every printed copy must be replaced"), Receipt
> header/footer text, Default language, Currency display.

### 5.10 People
> Staff & devices screen, desktop web. Staff table: name, role (Owner / Manager / Cashier /
> Barista), PIN status, "Reset PIN". Note under roles: "Only the owner can change prices and
> costs." Devices table: device name, type (KDS / Till / Both), enrolled date, "Revoke".

### 5.11 Marketing
> Marketing screen, desktop web, tabbed: **Loyalty** (program on/off, points per EGP, tier
> thresholds + multipliers + perks — each shown as a bounded slider with min/max), **Discount
> codes** (list + create, with depth and duration caps), **Habit Engine** (Rule 1 morning
> nudge and Rule 2 win-back, each a card with on/off, bounded targeting thresholds, send window,
> and a message-copy picker from an approved set), **Review Shield** (on/off, delay minutes,
> Google review URL, which staff get low-rating alerts).

### 5.12 Add-ons
> AI add-ons screen, desktop web. Four cards: Demand Forecasting & Waste, Off-Peak Pricing,
> Menu Engineering, Ramadan-Ready Labor Scheduling. Each card shows one of four states:
> **Not included** (an upsell with a small live preview chart built from the café's own data +
> "See preview"), **Preview** (watermarked, "read-only" chip), **Active** (toggle + "Open"),
> **Suspended** ("Payment needed to re-enable"). Prices per add-on.

### 5.13 Settings
> General settings screen, desktop web. Grouped toggles: Ordering (WhatsApp ordering on/off,
> payment methods, max open unpaid orders, abandon window, ask-table-number, upsell, cross-sell,
> minimum order value), Kitchen (default active stations, ETA parallelism slider 0.2–0.8,
> Gold priority sort), Nightly digest (on/off, time of day, recipients, language, sections),
> Notifications (event → who → channel matrix). A "Has POS / No POS" switch with an explanation.
> Each section has a "Restore defaults" link.

### 5.14 Account
> Account screen, desktop web. Current plan and price, add-ons, next invoice, invoice history
> table (download). "Export data (CSV)" for orders / items / materials. A "Data requests (DSR)"
> area. A read-only **audit log** table: time, who, what changed (before → after) — including
> "Veyrox support" rows when the platform acted on this café.

### 5.15 Onboarding checklist
> First-run onboarding checklist, desktop web. A vertical stepper with progress: Store details →
> Opening hours → Menu → Materials → **Real ingredient costs** → Recipes → Store QR → Staff →
> Devices → Test order. Each step: title, one-line description, status (done / current / locked),
> "Start". A progress bar "4 of 10". A callout on "Real ingredient costs": "Margins stay hidden
> until real costs replace the placeholders."

### 5.16 Nightly digest (WhatsApp message)
> Design the WhatsApp nightly digest **message** as it appears in a chat bubble, mobile. A
> two-sentence Arabic summary line at top, then a clean list: Revenue, Orders, Avg prep time,
> Repeat-customer rate, Review Shield summary, and a Cash vs Visa breakdown (count + amount
> each). Abandoned (waste) shown separately. Plain, scannable, no marketing styling.

---

## 6. Platform Admin (Veyrox operator, desktop web)

Foundation for this app: *Desktop web 1440px. **Deliberately distinct from the Store Console:
darker top bar, a visible "PLATFORM ADMIN" wordmark, a slightly denser layout** so it's never
mistaken for a café's console at a glance. Left nav: Fleet, Tenants, Entitlements, Flags,
Rails, Health, Support, Billing, Content, Compliance, Audit. Every mutating action requires a
"reason" field. Serious, operational, information-dense but still legible.*

### 6.1 WebAuthn login
> Platform Admin sign-in screen, desktop web. Minimal, dark. "Veyrox Platform Admin". A single
> "Insert your security key" prompt with a hardware-key icon and a "Continue" button. Small text:
> "Hardware key required. No password. Sessions last 4 hours." No "remember me".

### 6.2 Fleet overview
> Fleet overview dashboard, desktop web, admin (dark top bar). Top strip of KPIs: active tenants,
> orders today across fleet, open invariant violations (red if >0), template + LLM spend this
> month. A tenants table: café name, status (prospect / onboarding / active / suspended), orders
> today, health dot, plan, MRR. An "Open invariant violations" panel pinned near the top.

### 6.3 Tenants
> Tenants list + lifecycle screen, desktop web admin. Table of all cafés with status pills and
> a lifecycle indicator (prospect → provisioning → onboarding → active → suspended → churned).
> Row click opens a drawer: contact, WhatsApp number, plan, entitlements, onboarding progress
> bar, quick actions "Impersonate", "Suspend". "Provision new tenant" button top-right.

### 6.4 Provision tenant
> "Provision a new café" form, desktop web admin. Fields: café name, owner email, WhatsApp
> phone number, plan, initial add-on grants (none / preview / active each). A checklist preview
> of what will be created: "tenant, owner login, number mapping, default settings, seeded recipe
> library + Egyptian holiday calendar". Required "reason" field. "Provision" button. Note:
> "One action. No code, no SQL."

### 6.5 Onboarding progress (per tenant)
> Tenant onboarding detail, desktop web admin. The 10-step checklist from the Store Console
> shown read-only with per-step completion and timestamps, plus counts: "40 menu items, 0
> material costs entered". A highlighted risk: "Stuck 6 days on Real ingredient costs". A
> "Message owner" action and a "Impersonate (read-only)" action.

### 6.6 Entitlements
> Entitlements management screen, desktop web admin. Pick a tenant, see a table of entitlement
> keys (ai.forecasting, ai.menu_engineering, ai.offpeak_pricing, ai.ramadan_labor, multi_branch)
> each with a state selector: none / preview / active / suspended, plus granted-by, granted-at,
> expires, note. Required "reason" on change. A plans reference panel on the side.

### 6.7 Flags & kill switches
> Feature flags screen, desktop web admin. Top: five big **global kill switches** as prominent
> labelled toggles — safe_mode, review_gating, habit_engine, whatsapp_ordering, ai_addons —
> each with current state, last changed by/when, and a red confirm requiring a typed "reason".
> Below: a per-tenant overrides table and a "percentage rollout by tenant hash" control. A note:
> "Every switch here also has a CLI command."

### 6.8 Rails — official WhatsApp
> Official WhatsApp rail screen, desktop web admin. Per-tenant number registry: number, quality
> rating (green/yellow/red), messaging limit tier. A **template registry** table: template key,
> category (Utility / Marketing), approval status, per-tenant send count and spend. A warning
> row where a template is "Pending review" or "Reclassified to Marketing".

### 6.9 Rails — Habit Engine
> Habit rail (whatsapp-web.js) control screen, desktop web admin. A session health panel:
> connected / frozen, last successful send, sends today vs cap, suppression-list size. A
> prominent **Freeze** button (stop sending, keep session) and a **Channel switch** control
> (whatsapp-web.js → official Cloud API) with a confirm + reason. A **ban log** table: date,
> number, preceding 7-day volume, what changed. Serious, red-accented.

### 6.10 Health
> Fleet health screen, desktop web admin. Top and largest: "Open invariant violations
> (INV-1..INV-7)" — a table of any tenant + invariant + since-when, empty state "All green for
> 7 days". Below: job success rates, queue depth chart, SLO burn / error budget per tenant.

### 6.11 Support — order lookup
> Support order-lookup screen, desktop web admin. A search box (order number / phone / trace
> ID). Result: one screen with a vertical **timeline** from order_events, a **ledger movements**
> table (material, qty delta, reversal link), payment records, and messages sent (template key
> + params, no bodies). A "Reconcile payment" button that "calls the idempotent job — never a
> manual capture". A "Repair stuck order" action using standard transitions.

### 6.12 Ledger inspector
> Ledger inspector for one order, desktop web admin. Every material_ledger row for the order:
> timestamp, material, qty delta, recipe_version_id, and reverses_ledger_id links drawn as
> pairs. A per-material sum column that should be 0 for a voided order (highlight red if not).
> Read-only. "Snapshot" export button.

### 6.13 Impersonation
> Start-impersonation modal, desktop web admin. "Impersonate Brew & Baladi". Mode: **Read-only**
> (default) / Write. Write mode reveals: "30-minute hard limit", a required reason, and a warning
> "Cannot void, refund, or change prices, costs, or plans. Visible in the café's own audit log."
> Start / Cancel. Also design the **persistent banner** shown on every impersonated screen:
> a full-width coloured strip "You are impersonating Brew & Baladi (read-only) — 24:12 left · Exit".

### 6.14 Billing & usage
> Billing & usage screen, desktop web admin. Per-tenant table: subscription + add-ons, orders
> processed this period, WhatsApp template spend, LLM spend vs cap, PSP volume, gross margin.
> A note: "Invoicing is manual at this stage." Export.

### 6.15 Compliance
> Compliance operations screen, desktop web admin. Tabs: **DSR queue** (access/erasure requests
> across tenants, status, execute), **Retention runs** (what the nightly purge did, per date),
> **Review-gating posture** (per-tenant on/off with a fleet-wide kill switch and "export audit
> trail"), **R1 ban log** (shared with §6.9).

### 6.16 Audit
> Platform audit log screen, desktop web admin. An append-only table: time, platform user,
> action, target (type + id), tenant, **reason**, before → after. Filters by user, tenant,
> action type, date range. A note: "Append-only. Readable by all platform roles."

---

## 7. Suggested generation order

1. Foundation block → set project style.
2. Order webview: 2.1 → 2.2 → 2.3 → 2.6 → 2.7 (core loop first), then 2.8–2.10, then P1 (2.4, 2.5).
3. Ops KDS: 3.1 → 3.2 → 3.3, then 3.4, 3.5.
4. Ops Till: 4.1 → 4.2 → 4.3 → 4.4, then 4.5, 4.6.
5. Store Console: 5.1 → 5.3 → 5.2 → 5.4 → 5.5 → 5.6 → 5.7 → 5.8, then 5.9–5.16.
6. Platform Admin: 6.1 → 6.2 → 6.7 → 6.9 → 6.11 → 6.13, then the rest.
7. For each finished screen, add the one Arabic-RTL refinement prompt (§0.8).
8. Colour / type / spacing polish pass last, one screen at a time.
9. Export to Figma; hand to the visual designer as first-draft layouts, not final design.

---

## 8. Sources (Stitch prompting practices)

- [Stitch — Design UI using AI (Google Labs blog)](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/)
- [Google Stitch Prompt Guide and Best Examples for 2026 — aitoolsay](https://aitoolsay.com/blog/google-stitch-prompt-guide/)
- [Google Stitch Tutorial: From Prompt to UI in Minutes — 0xminds](https://0xminds.com/blog/guides/google-stitch-tutorial-prompts-guide)
- [Google Stitch for UI Design — UX Planet](https://uxplanet.org/google-stitch-for-ui-design-544cf8b42d52)
- [Design Mobile App UI with Google Stitch (Step-by-Step) — Codecademy](https://www.codecademy.com/article/google-stitch-tutorial-ai-powered-ui-design-tool)
