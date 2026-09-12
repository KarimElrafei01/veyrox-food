# F2 — Kitchen Display System: Frontend Implementation

Source of design: `Designs/stitch_kitchen_display_system_tablet/` — 5 screens (`3.1`–`3.5`) plus
`culinary_operations_display_engine/DESIGN.md` (token export) and `kds_chef_station_logo/`.

**Traces to**: FR-3.1–3.13 · ADR-0005 (SSE) · ADR-0006 (offline outbox) · ADR-0009 (frontend SPAs)
· ADR-0018 (frontend feature layering) · ADR-0010 (accept gate, no payment provider) · ADR-0022
(LAN peer relay for Till↔KDS order visibility during a shared internet outage).

**App**: `code/frontends/kds`. Scaffold already exists with three feature folders —
`features/accept-gate`, `features/availability`, `features/board` — each with the six ADR-0018
layers (`ui/ components/ hooks/ usecases/ repo/ datasource/`). This document maps every one of
the 5 screens onto that existing scaffold; no new feature folder is required.

This is a **frontend-only** document. Every request/response shape referenced here is specified
in full in the companion `backend-implementation.md` — this doc only says which screen calls
which endpoint, with which local state around it.

**Scope correction for this build pass (2026-09-12)** — three things this document assumes are
not yet true, resolved with the user before coding rather than discovered mid-build (working rule
2):

1. **Offline outbox not built yet.** §3.3/§3.4 describe every KDS action as fully operable offline
   via `packages/ops-core`'s IndexedDB outbox (ADR-0006). That outbox is scoped in
   `docs/06-sprint-plan.md` as **Sprint 4 (Till)**, not Sprint 3 (KDS) — `ops-core` is currently an
   empty placeholder. This pass builds **online-only**: direct API calls with optimistic UI +
   rollback-on-error. The staleness banner (§3) still renders correctly on an SSE drop, but actions
   taken while stale do not queue and replay yet — that lands when Till's Sprint 4 work builds the
   real shared outbox in `ops-core`, at which point §3.4's "(LOCAL)/pending sync" tags and §3.6's
   flush-on-reconnect become real. Nothing here reverses ADR-0006; it is sequencing, not a redesign.
2. **ADR-0022 (LAN peer relay) deferred, consistent with the backend.** §3's "3.5 Provisional
   tickets" subsection and every `lanPeers`/`syncState: "provisional"` reference in §6 are **not
   built this pass** — the backend's own LAN-relay receive/reconciliation endpoints were deferred
   earlier for the same reason (ship core KDS first). The staleness banner ships without the
   Till-orders-on-LAN caveat in its copy; §3.2's recommended banner text reverts to the simpler "new
   orders may be delayed" framing until ADR-0022 is actually implemented on both ends.
3. **No staff login/PIN-entry screen.** None of the 5 Stitch screens are one, and the backend's
   ADR-0023 is deliberately verification-only (no enrollment). This pass reaches every screen via
   dev-injected tokens (`pnpm tokens`); a real PIN-entry UI waits for the full S2–S5 auth realm.

---

## 0. Before writing a line of code

Per `.claude/skills/pixel-perfect-frontend/SKILL.md` (CLAUDE.md working rule 8), this section is
the design-system derivation the skill requires. Skip nothing below when this feature is actually
built.

### 0.1 This is a second, separate design system — not a Brew & Baladi reskin

`code/packages/ui/src/tokens/brew-baladi.css` is the **customer-facing** identity: warm,
cream/espresso, light-first, only opts into dark on explicit toggle (comment in that file: *"the
Stitch source ships no dark design... the palette therefore commits to light for the default"*).

The KDS export (`culinary_operations_display_engine/DESIGN.md`) is a **permanently-dark,
industrial** system for wall-mounted kitchen hardware — different brand, different physical
viewing conditions (4–8 feet, steam, glare, wet/gloved fingers), different typefaces (Chivo +
JetBrains Mono vs. Plus Jakarta Sans + Inter). These must not be merged into one token file or
toggled by `data-theme="dark"` on the existing Brew & Baladi tokens — a dark-mode customer webview
and an always-dark kitchen tablet are not the same thing wearing a different coat of paint.

**Proposal**: a third token file, `code/packages/ui/src/tokens/kds-industrial.css`, following the
exact `--vx-*` naming convention already established, keyed to a new `data-theme="kds-industrial"`
(or a dedicated `:root` in an app that only ever loads this one file — `code/frontends/kds` never
needs to switch themes, unlike a component library shared across apps). It **commits to dark
only**, the same way `brew-baladi.css` commits to light only — no light variant exists in the
source, and none should be invented.

Token derivation from `DESIGN.md`, renamed onto the existing scale:

| Stitch token | Value | `--vx-*` role |
|---|---|---|
| `surface` / `background` | `#0b1326` | `--vx-surface`, `--vx-surface-dim` |
| `surface-container-lowest` | `#060e20` | `--vx-surface-lowest` |
| `surface-container-low` | `#131b2e` | `--vx-surface-low` |
| `surface-container` | `#171f33` | `--vx-surface-container` |
| `surface-container-high` | `#222a3d` | `--vx-surface-high` |
| `surface-container-highest` | `#2d3449` | `--vx-surface-highest` |
| `surface-bright` | `#31394d` | `--vx-surface-bright` |
| `on-surface` | `#dae2fd` | `--vx-on-surface` |
| `on-surface-variant` | `#bbcabf` | `--vx-on-surface-variant` |
| `outline` / `outline-variant` | `#86948a` / `#3c4a42` | `--vx-outline`, `--vx-outline-variant` |
| `primary` (Kitchen Green) | `#4edea3` | `--vx-primary` |
| `on-primary` | `#003824` | `--vx-on-primary` |
| `primary-container` | `#10b981` | `--vx-primary-container` |
| `secondary` (Alert Amber) | `#ffb95f` | `--vx-secondary` |
| `secondary-container` | `#ee9800` | `--vx-secondary-container` |
| `tertiary` (soft red accent) | `#ffb3ad` | `--vx-tertiary` |
| `error` / `error-container` | `#ffb4ab` / `#93000a` | `--vx-error`, `--vx-error-container` |

Two colors named in `DESIGN.md`'s prose section but **not** in its own token block are a real
discrepancy worth flagging rather than silently picking one: the prose calls the base background
`#0f172a` and the ticket surface `#1e293b` ("Colors" and "Elevation" sections), while the
machine-readable `colors:` front-matter says `surface: #0b1326` / `surface-container: #171f33`,
and every screenshot and `code.html` actually renders the front-matter values. **Treat the
front-matter block as authoritative** (it's what the shipped screens use); the prose numbers read
like an earlier draft of the same palette that wasn't updated after a token pass. Do not average
the two or pick the prose numbers — that would produce a system that matches neither screenshot.

Typography — new families, added via the same `@fontsource` mechanism already used for Cairo/Inter/Plus
Jakarta Sans:

- `Chivo` (weights 500/600/700/800) — headlines, ticket names, item lines, buttons.
- `JetBrains Mono` (weights 600/700) — every timer, elapsed/remaining count, order ID, label chip.
  **Never substitute a proportional font for a timer.** `DESIGN.md`: *"eliminate horizontal jitter
  when seconds tick"* — a proportional font's digits change width every second and the ticket
  visibly wobbles.

Spacing/shape tokens map directly: `touch-target: 3.5rem` (56px) is the binding one — every bump
button, accept/reject button, and toggle in this feature must clear it; `touch-min: 3rem` (48px)
is the floor for secondary controls (station stepper, close buttons). Radius is compact
(`DEFAULT: 0.25rem` … `xl: 0.75rem`) — reject the fully-rounded soft-UI look used elsewhere in
`packages/ui`'s `Button`/`Card` primitives by default; this system uses rounded corners only up to
`0.75rem` and reserves pill shape (`rounded-full`) for small status badges only, per `DESIGN.md`
"Shapes".

### 0.2 Component-library research (per skill requirement, before hand-rolling)

Reuse from `code/packages/ui/src/primitives` rather than rebuilding, with the noted deltas:

| Primitive (exists today) | Reused for | Delta needed |
|---|---|---|
| `Card` | Ticket cards, item rows, drawer item cards | New `tone` variant driven by ticket age (green/amber/red 2px border, per `DESIGN.md` "Level 2") |
| `Badge` | Priority/VIP tag, allergy/dietary chips, "86'D" tag, connection dot | Needs a `high-contrast` variant: solid fill + black or near-black text for allergen chips (design explicitly avoids color-only signaling for color-blind kitchen staff — an icon + bold label is mandatory, never color alone) |
| `Chip` | Reject-reason chips, category filter pills (86 drawer), modifier tags | Existing pill radius is likely too soft for this system's 4px corner language — override radius per screen, don't change the shared default (Brew & Baladi still wants its pill chips) |
| `Stepper` / `ProgressTracker` | Ticket-detail 4-step timeline (Received → Station Prep → Cooking → Expo Ready) | Needs a horizontal, 4-node, timestamp-annotated variant; check current API supports arbitrary per-step timestamp/duration labels, extend if not |
| `IconButton` | Header controls, close buttons, stations +/- | As-is |
| `BottomSheet` | 86 drawer (screen 3.5) on narrow viewports | The Stitch design renders this as a right-anchored slide-in panel on tablet width; `BottomSheet` is presumably bottom-anchored — confirm whether it supports a `side="right"` variant before extending it, since a wide tablet in landscape has room for a side panel and a bottom sheet would cover active tickets underneath it |
| `Button` | All primary/secondary actions | As-is, themed by the new token file |

No external component library is warranted here — the interaction surface (cards, chips, a
stepper, a drawer, toggles) is fully covered by existing primitives plus the deltas above. Do not
introduce a third-party kanban/board library for the ticket rail: it is a CSS grid of cards with a
handful of interaction states, not a generic drag-and-drop board (nothing here is draggable — cards
advance by tapping, never by dragging between columns).

### 0.3 Placeholder assets — flag, do not invent

- **Logo** (`kds_chef_station_logo/code.html`): references a `googleusercontent.com` AIDA-generated
  image. This is a Stitch placeholder, not a real asset. Flag as `[PLACEHOLDER: KDS wordmark/icon
  lockup — no real Veyrox Food KDS logo exists yet]` and use a text lockup ("VEYROX KDS" in Chivo
  800) until a real mark is supplied.
- **Menu item photography** in the 86 drawer (`3.5`, wagyu burger / truffle fries / salmon /
  cauliflower / brioche buns): all `googleusercontent.com` AIDA-generated stock. Flag as
  `[PLACEHOLDER: menu item photo]` per item — these must come from the tenant's actual menu photo
  uploads (Catalog context) once a pilot café is signed; until then render the existing
  `packages/ui` empty-image treatment, not a fake photo that looks like real menu content ("Brew &
  Baladi" is a fictional persona — shipping fabricated food photography as if real would misrepresent
  the product in a demo).
- All order numbers/customer names ("#1042 MARCUS", "Sophia", etc.) are Stitch mock data — real
  data comes from `order_number` (format `A-047`, per `04-data-model.md` §6) and the customer's
  WhatsApp profile name or Till-entered name. The 4-digit `#1042`-style numbering shown throughout
  the mock is **not** the real format and must not be copied into the implementation.

### 0.4 RTL

English is default; Arabic must render correctly from the first screen (CLAUDE.md non-negotiable).
Kitchen staff in an Egyptian café are a primary Arabic-reading audience, so this is not a
lower-priority pass here the way it might be for an admin-only tool.

- Timers and order IDs (JetBrains Mono) stay **LTR always**, even inside an RTL page — digits and
  the mm:ss format do not mirror. Wrap every timer/order-number span in `dir="ltr"` regardless of
  document direction, same pattern F1 already uses for money.
- Ticket column order mirrors: New → Received → Preparing → Ready reads right-to-left in Arabic,
  i.e. the DOM order stays semantic (New first) and `flex-direction`/grid `direction` flips via the
  `dir` attribute, not by manually reversing the column array — reversing the array breaks
  `Last-Event-ID` replay's implicit left-to-right column assumption in nothing, but it does break a
  developer's mental model and any test that asserts column order by array index.
- The 86 drawer slides in from the **inline-end** edge (right in LTR, left in RTL), not a
  hard-coded `right: 0`.
- Reject-reason chips and modifier badges: text-align follows direction; icon-before-text in LTR
  becomes icon-after-text (still leading edge) in RTL, per the existing `packages/i18n` /
  `packages/ui` direction handling already proven in `code/frontends/order` (`direction.test.ts`).

### 0.5 Accessibility

- **Never color-only.** Every ticket-age color state (green/amber/red) ships with a redundant
  signal already present in the design — the countdown timer's actual value, and for the critical
  state an explicit "CRITICAL · LATE" text badge. Preserve both; do not let a future refactor drop
  the text badge because "the border color already says it" (a design-system rule the source
  document states explicitly for color-blind kitchen staff).
- Touch targets ≥48px everywhere, ≥56px for primary actions (bump, accept) — already covered by
  token choice in 0.1, called out again because a shrink-to-fit layout pass is exactly where this
  regresses first.
- `axe` is in the merge gate (CLAUDE.md) for every frontend, KDS included, despite it being an
  internal staff tool.

---

## 1. Screen 3.1 — Live Orders Board

**Source**: `3.1_kds_board/screen.png`, `3.1_kds_board/code.html`.
**Feature folder**: `features/board`.
**Traces**: FR-3.1, FR-3.3, FR-3.4, FR-3.6, FR-3.8, FR-3.10, FR-3.13.

### 1.1 Layout

Persistent app shell (shared across all 5 screens, lives in `features/board/ui` as the default
route shell since the board is the KDS's home screen):

- **Header** (fixed, 80px): line label ("Hot Line 1 - Main Kitchen"), live connection dot +
  "Connected · updated Ns ago" (FR-3.6), primary nav (Live Orders / Recall Log / Expo Summary —
  Recall Log and Expo Summary are out of scope for this pass, stubbed as disabled/"coming soon"
  routes), station stepper (FR-3.10), "86 Items" button with a badge count of currently-unavailable
  items (opens `features/availability`'s drawer — screen 3.5), settings icon, staff avatar.
- **Metrics strip** (below header): live-stream indicator, rail capacity (`active tickets / column
  capacity`), peak velocity, line-pace summary, "Recall Bump" button (reverses the most recent bump
  — see §1.4).
- **Four-column ticket rail**: New / Received / Preparing / Ready, each with a live count badge.
  Columns do not shrink below 300px (`DESIGN.md` layout rule); below that width the rail becomes
  horizontally scrollable rather than reflowing to fewer columns — a kitchen tablet is never
  expected to show fewer than 4 columns at once, since hiding a column would hide active tickets.
- **Footer** (persistent across the whole app, not just this screen): expo summary bar — active
  ticket count, delayed(>15m) count, average turnaround, "Lock Screen", "Batch Print Tickets".

### 1.2 Ticket card anatomy

Every card (all four columns) shares one anatomy, with column-specific actions at the bottom:

- 4px top status bar, colored by age: green (on-pace) → amber (approaching target) → red (overdue),
  independent of column — a `Preparing` ticket can already be red.
- Header band: source icon (WhatsApp chat bubble vs. Till/register icon) + channel label + table
  or pickup-point label, order number + customer first name, right-aligned monospaced timer.
- Item lines: `qty× Name`, with modifier sub-lines; allergen/special-instruction chips render as
  **inverted high-contrast** badges (amber or red fill, pure black text) — never a soft outline
  chip, which is the one place this design intentionally breaks the "no fully-filled loud chips"
  instinct a designer might otherwise apply, because a missed allergy is a categorically worse
  failure than a slightly loud UI.
- Footer action, one of:
  - **New, unaccepted** (`status="pending"` for Till, `status="placed"` for WhatsApp): a waiting
    banner + countdown ("WAITING 2:14 — ACTION NEEDED") replacing the top bar when age > 2 min
    (FR-3.13), and **Accept / Reject** buttons — tapping either opens the modal (screen 3.2), the
    card itself is not the point of no return.
  - **New, freshly arrived** (age ≤ 2 min): plain card, tap-anywhere opens the same modal (`onclick="advanceCard"` in the Stitch source is actually "open the ticket" here, not "advance status" — New cards never silently advance, they always require the explicit Accept/Reject decision).
  - **Received / Preparing**: "Start Ticket" (Received → Preparing) or "Bump to Ready"
    (Preparing → Ready) — tap-anywhere-on-card also advances one status per FR-3.2 ("tapping a
    ticket advances it one status"), matching the Stitch source's `onclick="advanceCard(this)"` on
    the whole `<article>`. Per-item rows are independently tappable (`toggleItem`) to mark that line
    complete without advancing the ticket — strikethrough + 40% opacity, matching `DESIGN.md`
    "Order Item Rows & Modifiers".
  - **Ready**: "Expedite / Deliver" for dine-in (hands to a runner/passes to heat lamp) or "Hand
    Off to Courier" for delivery-channel orders — both are the terminal action that transitions to
    `collected` semantics for a no-payment-collection-at-KDS flow... **except**: `collected`
    per `01-system-design.md` §4.3 requires a `payment_method` and is where cash/visa is recorded.
    A KDS "Expedite/Deliver" tap is **not** the collection event — it is a bump within `ready`
    (or a courier-handoff annotation) that a cashier or the customer's own pickup still finalizes via
    Till's `POST /orders/:id/collect`. This screen must not silently mark an order paid; see backend
    doc §2.6 for the exact contract.

### 1.3 Tapping to advance vs. opening detail

Two different taps look almost identical and must not be confused in implementation:

- Tap on a **New** card → opens the Accept/Reject modal (screen 3.2). Never advances directly.
- Tap on a **Received/Preparing** card body → advances one status (`POST /orders/:id/advance`),
  matching "tap card to advance" hint text shown on those cards.
- Tap on the **order number/customer name** specifically (not the card body) → opens the full
  Ticket Detail view (screen 3.4) instead of advancing — this is how a barista reaches the undo
  timeline without accidentally bumping the ticket. Implement this as a distinct tap target
  (`stopPropagation` on the header, not the whole card) rather than a timing-based
  tap-vs-long-press heuristic, which is unreliable on damp/gloved fingers exactly where this
  product must not fail.
- Tap on an **individual item row** → toggles that item's completion tick (local + synced state,
  §1.5), does not advance the ticket, `stopPropagation` from the card's advance handler.

### 1.4 Recall Bump

Header-level "Recall Bump" reverses the single most recent bump action **on this station**, distinct
from the per-ticket "Move Back 1 Step" on the ticket-detail screen (§4). It exists for the case
where a barista bumps the wrong ticket in a rush and wants a one-tap global undo without hunting
for that specific ticket. Backend contract: same `POST /orders/:id/revert` endpoint, with the
target order id resolved client-side from "the last order this KDS session successfully advanced,"
kept in local component state (not persisted) — if the app was reloaded since that bump, disable
the button rather than guessing.

### 1.5 Item completion ticks — client + sync model

Per the resolved question, this is **not** a new `order.status` value. Model:

- Each item row's tick state is derived by folding `order_events` rows where
  `metadata.action = "item_tick"` for that `order_item_id` (see backend doc §3 for the exact event
  shape) — last event per item wins.
- Tapping a row optimistically flips local state immediately (tactile feedback must be instant —
  `DESIGN.md` "immediate scale shift... solid contrast inversion"), then fires the mutation with an
  `Idempotency-Key`; a failure reverts the optimistic flip and shows a small inline retry, it does
  not block the rest of the ticket.
- Because these are ordinary idempotent mutations through the one write path, they ride the same
  offline outbox as every other KDS action (ADR-0006) — no special-casing needed.

### 1.6 SSE wiring

`features/board/hooks` owns the single `EventSource` connection for the whole app (opened once at
shell mount, not per-screen) via `packages/ops-core`'s SSE client (scheduled Sprint 3 per that
package's current placeholder comment). Every screen in this document reads from the same
normalized in-memory board state that hook maintains; screens 3.2–3.5 are overlays on top of the
board, not separate data-fetching roots.

- On mount: `GET /staff/board` for the full snapshot, then open `GET /staff/stream` with
  `Last-Event-ID` from the highest `order_events.id` in that snapshot.
- Each incoming event patches one order's state in place (by `order_id`) — never a full re-fetch,
  which is exactly the "SSE means never polling, ever" contract (ADR-0005).
- Heartbeat comment every 20s resets a local staleness timer; no heartbeat for >10s flips the header
  dot and triggers screen 3.3 (FR-3.6's "unmissable" requirement — see §3).

---

## 2. Screen 3.2 — Accept / Reject Ticket

**Source**: `3.2_accept_reject_ticket/code.html` (screenshot only shows the scrolled-down half;
the full modal — header, timer capsule, item list, special-instructions block — is in the HTML).
**Feature folder**: `features/accept-gate`.
**Traces**: FR-3.11, FR-3.12, FR-3.13, ADR-0010.

### 2.1 Layout

Full-screen modal overlay (the dimmed board renders behind it, blurred, per the Stitch source's
"Dimmed 4-Column KDS Board" background layer — this reinforces that the rest of the kitchen is
still live while this one ticket is being decided):

- Top alert bar: thin animated pulse strip in `primary-container` while awaiting a decision.
- Header: channel badge (WhatsApp icon), source label + fulfillment type ("Pickup · Direct Pay"),
  order number + customer name, a live waiting-time timer (this is the FR-3.13 age timer, shared
  state with the New card behind it — not a separate clock), close (✕) button.
- Metadata stripe: placed-at timestamp, priority flag if applicable.
- Scrollable item list: each item card shows qty, name, target station (routing hint, e.g. "GRILL
  STATION" / "FRYER 2" / "BAR / EXPO" — cosmetic today, no station-routing logic exists in the
  domain model yet; treat as a display-only label derived from the menu item's category until/unless
  a real station-assignment feature is scoped), and modifier chips (allergen chips in the same
  high-contrast inverted style as the board cards).
- Customer special-instructions block, rendered verbatim, never parsed (`customer_note`, ≤140
  chars, per `04-data-model.md` §6 comment — this field is display-only by explicit data-model
  decision, so this screen must not attempt to extract structured meaning from it, e.g. no
  "detected: pack separately" chip synthesized from free text).
- Action footer: **Reject** (secondary, opens an inline reason-chip panel — does not immediately
  reject) and **Accept Order** (primary, full-width, green). A one-line note under Accept: "Materials
  are deducted and the timer starts when you accept" — this is not decorative copy, it is the
  correct statement of ADR-0010's accept gate and should be treated as required, not optional,
  copy if this screen is ever redesigned.

### 2.2 Reject flow

Tapping **Reject** does not reject — it expands a 3-chip panel (`Too busy` / `Item unavailable` /
`Closing`, matching FR-3.12's exact reason enum) in place, keeping Accept visible the whole time so
a mis-tap on "Reject" costs one extra tap to recover from, not a confirmation dialog. Tapping a
reason chip fires the reject mutation immediately (no further confirmation — the reason chip *is*
the confirmation) and closes the modal.

### 2.3 Accept flow

Tapping **Accept Order** immediately gives tactile feedback (button relabels to "ACCEPTED · SENT
TO LINE" with an inverted color flash), fires the accept mutation, and closes the modal after a
short delay so the flash is perceptible — this matters more here than almost anywhere else in the
app because Accept is the one action per non-negotiables that starts consuming real inventory
(material ledger `sale_deduction` rows), so a barista must have zero doubt the tap registered
before they move to the next ticket.

### 2.4 Idempotency

Both Accept and Reject carry a client-generated `Idempotency-Key`. A double-tap on Accept (the
close-delay above makes a fast second tap plausible) must not deduct materials twice — this is
exactly FR-3.5's "double-taps are the norm" contract, and here it is load-bearing in a way it isn't
for a pure status advance, because the ledger's `sale_deduction` insert is not itself
idempotent-by-nature the way a status column overwrite is (see backend doc §2.2 for the exact
guard).

---

## 3. Screen 3.3 — Stale Connection State

**Source**: `3.3_stale_connection_state/screen.png` (code.html not separately re-read; screenshot
is complete and self-explanatory for this screen).
**Feature folder**: `features/board` (this is a board-state overlay, not a separate feature —
staleness is inherently about the same SSE connection the board owns).
**Traces**: FR-3.6, ADR-0005, ADR-0006.

### 3.1 Trigger and layout

When the SSE heartbeat gap exceeds 10s (FR-3.6's threshold) or the connection errors out
(`ERR_SOCKET_TIMEOUT` in the design's example — a real fetch/EventSource error code, not
copy-invented), the shell renders, in order from the top:

1. A **full-width red banner**, not a toast, not a corner badge — "NOT CONNECTED — LAST UPDATE
   41S AGO. Tickets may be missing. New incoming orders paused." with a live-updating age
   counter and a prominent **Retry Now** button. This is the "unmissable" requirement from FR-3.6
   made concrete: it must be impossible to have this banner on screen and believe the board is live.
2. Below it, a secondary status line: `SYNC FAILED: <error code>` — surfaces the actual
   transport error for on-call debugging without requiring remote access to the tablet.
3. The **board itself dims and blurs** behind the banner (`opacity-*` + `blur` on the ticket grid
   in the source) rather than disappearing — tickets already loaded stay visible (café wifi drops
   are recoverable in seconds to minutes; hiding known-good data during a drop would be strictly
   worse than showing slightly-possibly-stale data with an honest banner on top, which is exactly
   the tradeoff FR-3.6 is designed around).
4. An **"Offline Buffer Active"** chip floats over the board: "Local tickets preserved (Queue: N
   cached bumps)" — this is the visible face of `packages/ops-core`'s IndexedDB outbox
   (ADR-0006). `N` is the outbox's pending-item count, read directly from that queue, not a
   separately-maintained counter that could drift from it.

### 3.2 "New incoming orders paused" — what this actually means, and what it no longer fully means

The banner's copy says new orders are paused. Precisely: **WhatsApp orders** are paused from this
tablet's perspective — they arrive via the cloud API/SSE stream, and this tablet cannot currently
reach it. The backend itself keeps accepting and queuing them regardless of any one tablet's
connection state (the single write path doesn't care whether a KDS tablet is watching); "paused"
describes what **this tablet** can currently learn, not what the café is capable of accepting.

**Till orders on the same LAN are the exception, per ADR-0022**: if the café's whole internet is
down (the scenario this banner is actually about) and a paired Till device is reachable on the
local network, a new Till order can still reach this board — as a **provisional** ticket (§3.5) —
without waiting for either device to reach the cloud. The banner copy must not claim an absolute
"no new orders are arriving," because during exactly the outage this banner exists to describe,
that's no longer always true. Recommended copy split:

> "NOT CONNECTED — LAST UPDATE 41s AGO. WhatsApp orders may be delayed. Till orders on this network
> still appear as provisional until reconnected."

A barista must not read this as "the café stopped taking orders" (it hasn't), must not read it as
"everything is fine" (it isn't — WhatsApp visibility is genuinely degraded), and must now also be
able to tell **which category** of order this banner's caveat applies to, since half of it (Till,
same LAN) is actively still working.

### 3.3 Full offline operability — this is not a degraded, read-mostly mode

Per the resolved product requirement, the KDS is **100% operable** during this state, not merely
"still showing old data." Every action available when connected — Accept, Reject, Advance, Revert
(within its window), item ticks, even opening the 86 drawer and toggling availability — works
identically while disconnected. The only thing that changes is **what a barista cannot see happen
immediately**: a WhatsApp confirmation/ready message cannot be sent by a device with no path to
the API, so it queues (ADR-0006) and fires once connectivity returns, same as every other queued
mutation. Nothing about this screen should gate or gray out board interactions — the red banner is
purely informational, never a modal-like blocker. This is a meaningful strengthening of what was
previously written here (an earlier pass of this document undersold offline operability as "a
local bump queue on in-progress tickets"); the corrected statement is unconditional: **every KDS
action in this feature is available offline**, per §3.4's local outbox and, for new Till orders
specifically, per §3.5's LAN relay.

### 3.4 Actions taken while stale

Every write in this feature — board bump, accept/reject, revert, item tick, 86 toggle — is written
to the local outbox and applied optimistically to local state regardless of connectivity
(ADR-0006), *except* payment, which is not present on this screen at all (the KDS never collects
payment; that stays Till-only, and that asymmetry is unchanged by anything in this update). Any
button whose action is currently only locally applied (not yet confirmed by the server) should
carry a small "(LOCAL)" or "pending sync" tag, matching the Stitch source's own "Bump Ticket
(LOCAL)" treatment — this distinguishes an optimistically-applied action from a
confirmed-by-server one at the exact moment that distinction is most likely to matter (right
before the connection recovers and the barista wants to know whether their last few taps actually
landed).

### 3.5 Provisional tickets — the LAN-relayed case (ADR-0022)

A ticket that arrived via LAN relay from a Till device rather than via the normal cloud path
(`syncState: "provisional"`, backend doc §1/§7) must be **visually distinct from every other New
card** — not a subtle distinction, since the practical risk is a barista reading its placeholder
number out loud at the counter as if it were the real pickup number:

- Order-number field shows the provisional label (e.g. `OFFLINE-3`) styled differently from a real
  `A-0xx` number — a dashed border and an explicit "PROVISIONAL · NOT YET SYNCED" tag, not just a
  different string in the same slot.
- The card otherwise behaves like any New ticket — Accept/Reject/tap-to-open all work — but any
  action taken on it shows as "pending_local" (§3.4's local tag, plus a clarifying note "will sync
  once order is confirmed") until backend doc §7.2's reconciliation swaps it for the real,
  confirmed ticket in place.
- When reconciliation happens, the swap must be visually smooth (the same card, same column
  position, a brief highlight on the number field changing from `OFFLINE-3` to `A-052`) — not a
  disappear-then-reappear, which would read as "the ticket vanished" for the half-second it takes.
- A provisional ticket that's been open for an unusually long time without resolving (backend doc
  §7.4's staleness timeout) should visually flag as "never confirmed — check with the till" rather
  than continuing to look like an ordinary aging ticket, since past that point it may represent an
  order that was never actually placed against the system of record.

### 3.6 Recovery

On reconnect (`Retry Now` or automatic `EventSource` reconnection), the flow is: flush the outbox
(oldest-first, per ADR-0006 — this now includes replaying any pending mutations against
provisional tickets once they resolve, per ADR-0022 §5 and backend doc §7.3), then resync the
board via `Last-Event-ID` replay or, past the gap cap, a fresh `GET /staff/board` snapshot
(ADR-0005 §"gap cap"). The banner and dimming clear only once both the flush and the resync have
completed — clearing the banner while stale outbox items are still in flight would show a "you're
live" board that is about to visibly jump as queued bumps land, which is worse than a few extra
seconds of banner. Any provisional tickets still unresolved at this point stay provisional (§3.5)
— recovery of *this* device's own connectivity does not, by itself, guarantee the Till peer that
created them has also reconnected and flushed.

---

## 4. Screen 3.4 — Ticket Detail & Undo

**Source**: `3.4_ticket_detail_undo/screen.png`.
**Feature folder**: `features/board` (reached from a board ticket's header tap, §1.3 — not a
standalone route).
**Traces**: FR-3.7, FR-3.8.

### 4.1 Layout

Full-screen detail view (not a modal over a dimmed board this time — it replaces the rail because
it's meant for a longer, closer look at one ticket than the Accept/Reject decision):

- Header: order number + customer name, VIP/priority badge if set, source/table label, total
  active time (elapsed since accept — monospaced, ticking), close (✕) back to the board.
- **Status strip**: current status pill ("STATUS: READY") + a one-line description of the most
  recent transition ("Just advanced from Cooking (Hot Hold Station B)"), plus a small live
  indicator ("Plate Bell Rang · Expo Standby") — this last bit is cosmetic flavor text in the
  source and should be treated as **optional polish**, not a contract; do not build backend support
  for arbitrary expo-side status strings unless a real requirement shows up for it.
- **4-step timeline** (Received / Station Prep / Cooking / Expo Ready), each node showing an
  elapsed duration and a wall-clock or relative timestamp. Per the resolved question, only two of
  these four points are real, persisted timestamps today:
  - **Received** = `orders.accepted_at`.
  - **Expo Ready** = `orders.ready_at`.
  The other two ("Station Prep", "Cooking") have **no dedicated timestamp column** in
  `04-data-model.md` today. Render them as derived, best-effort markers instead of pretending they're
  as authoritative as the two real ones:
  - **Station Prep** ← the `order_events` row where `to_status = 'preparing'` (a real transition,
    just not mirrored onto a denormalized `orders` column the way `accepted_at`/`ready_at` are).
  - **Cooking** ← the earliest `item_tick` metadata event for this order (§1.5) — i.e., "cooking"
    visually starts the moment a barista first marks any line item in progress, which is a
    reasonable proxy but is explicitly a **UI-computed timestamp, not a stored one**. If item ticks
    never happen for a given ticket (a barista who only uses the coarse advance flow and never
    touches per-item rows), this node has no timestamp to show — render it as "—" rather than
    fabricating one, and do not block the rest of the timeline on it.
- **Ticket items list**, same per-item tap-to-complete rows as the board card, but with room for
  the extra per-item metadata the compact card can't show: preparing station, "Plated by <staff
  name>" attribution. Staff attribution here is cosmetic display copy in the source (no
  `plated_by_staff_id` column exists) — if this is wanted as real data, it needs an explicit
  scoping decision (which action writes it? every item tick, just the last one, a separate
  "claim this item" gesture?) before being added to the data model; this document does not invent
  that decision.
- **Guest-notified panel**: shows the actual outbound WhatsApp "ready" ping status
  ("Ready pickup notice dispatched... at 12:41 PM") with a **Resend Ping** action — this is real
  and maps directly to FR-3.2's auto-send-on-Ready behavior; Resend re-triggers the same
  notification job, does not create a second "ready" order_event.
- **Footer actions**: "Move Back 1 Step" (with a live countdown, §4.2) on the left, "Final Bump ·
  Hand Off" (the terminal action for this status) on the right.

### 4.2 Move Back 1 Step — undo semantics

Per the resolved decision: **the bump this is reversing already committed server-side.** The
countdown (screen shows ~44–47s remaining) is the client-visible remainder of the **60-second undo
window already specified in FR-3.7** ("a ticket can be moved back one status within 60 seconds")
— it is not a hold-before-send delay. Concretely:

- The instant a ticket is bumped to its current status, the client starts a 60s local countdown and
  shows the "Move Back 1 Step" affordance with the remaining time.
- Tapping it within the window calls `POST /orders/:id/revert` (already listed in
  `05-api-and-integration-contracts.md` §3) — a real, separate mutation, recorded as its own
  `order_events` row with the actor, per FR-3.7.
- After 60s, the affordance disappears (or, per the design's visible progress bar under the
  button, visually drains to empty) — the backend independently enforces the same 60s window
  (§below in the backend doc), so a client clock skew never grants a longer undo window than the
  server will actually honor. **The client-side countdown is a UX affordance, not the source of
  truth for whether undo is still allowed** — always attempt the call and handle a `409` from an
  expired window gracefully (toast: "Too late to undo — ask a manager to void this order instead"
  pointing at the real recovery path, which is Till's void flow, not a KDS feature).
- Per FR-3.7 and INV-7: this can undo a **status** transition. It can **never** touch the material
  ledger — "ready messages already sent are not un-sent, but the reversal is logged" is the exact
  boundary. If the ticket being reverted is `ready → preparing` and a ready-notification WhatsApp
  message already sent, that message is not recalled; the revert only stops any *not-yet-sent*
  side effect that was still pending in the same commit hook (e.g., if the notification job hadn't
  fired yet). This is why FR-3.7 explicitly calls out that the send is not undone — it is stating a
  real race, not a hypothetical one.

---

## 5. Screen 3.5 — 86 An Item Panel

**Source**: `3.5_86_an_item_panel/code.html` (full drawer content; the screenshot alone is
cropped to the viewport and undersells the actual list/toggle content below the fold — read the
HTML, not just the PNG, for this screen).
**Feature folder**: `features/availability`.
**Traces**: FR-3.9, FR-2.7 (owning FR), FR-10.14.

### 5.1 Layout

Right-anchored slide-in drawer (not a bottom sheet on this tablet-landscape target — see §0.2's
`BottomSheet` note) over a dimmed, blurred board:

- Header: "86 · Mark Unavailable" title + "Live Sync" badge, close button.
- A single fixed notice: "This hides it from customers immediately." — this is not a tooltip or a
  dismissible hint, it is a permanent warning line, because the action it describes is instant and
  irreversible-feeling in the moment (an item disappearing from the live customer menu, per
  FR-10.14 bypassing any draft/review step).
- Search box (menu items or modifiers) + category filter pills (All / Mains / Sides / Drinks —
  tenant's actual menu categories, not a fixed enum).
- Scrollable item list, each row: photo thumbnail (see placeholder note §0.3), name, status badge,
  a large touch toggle (green = available, red = 86'd), and contextual metadata (station, SKU,
  "Off since <time> — auto-returns at close" for already-86'd items, "LOW: ~N LEFT" for
  low-stock warnings).
- Footer: channel-sync indicator ("3 Channels Synced (POS, Kiosk, Online)"), "Reset All Items",
  "Done".

### 5.2 What's real vs. what's a forward-looking mock in this screen

Being explicit here matters because this screen mixes shipped-scope and clearly-not-yet-scoped
ideas in one visual, and copying it uncritically would silently expand scope (CLAUDE.md working
rule 5):

| Element | Status |
|---|---|
| Toggle an item/modifier available ↔ unavailable | **In scope.** This is exactly FR-2.7/FR-3.9/FR-10.14 — the endpoint already exists in the contract table (`POST /menu-items/:id/availability`). |
| Search + category filter | **In scope**, pure client-side filter over the already-fetched menu list — no new endpoint. |
| "Off since 8:15 — auto-returns at close" | **Not in scope today.** No auto-return-at-close mechanism exists in FR-2.7 or the data model. If wanted, it needs its own FR and a scheduled job (comparable to the existing `order.abandon` cron in `01-system-design.md` §"jobs" table) — flagging here rather than quietly implementing it, since it changes what "86" means (a timed suspension vs. a manual toggle a human must remember to flip back) and someone should decide that on purpose. |
| "3 Channels Synced (POS, Kiosk, Online)" | **Aspirational copy for a future integration.** v1 has no POS integration path beyond the `has_pos`/`no_pos` setting (`13-admin-and-configuration.md`) and no kiosk channel at all. Render this line only once/if those channels are real; until then, either omit it or make it generic ("Synced across all ordering channels") so it doesn't assert integrations that don't exist. |
| Low-stock countdown ("~8 LEFT") | **Not in scope.** This implies live stock-quantity tracking per menu item, which the material ledger tracks at the *raw material* level, not finished-portions-remaining — portions-remaining would require a live recipe-based projection against current material stock, a materially bigger feature than 86-ing. Flag as a genuinely good v2 idea, not a v1 gap. |

Build exactly the first two rows of that table for this pass; render the rest as visual states only
if/when their backing features are scoped, not as decoration that implies they already work.

### 5.3 Toggle interaction

Each toggle is optimistic (instant visual flip + haptic `navigator.vibrate` if available, matching
the Stitch source's script) with the mutation fired immediately after — same idempotent,
outbox-backed pattern as every other KDS write. Because this mutation is customer-visible the
instant it lands (per the panel's own warning text), do **not** debounce or batch rapid toggles on
the same item; each toggle is its own `Idempotency-Key`'d request, so a barista who flips an item
off then immediately back on produces two real, auditable events rather than a coalesced no-op —
that audit trail is the whole point of an availability change being instant and consequential.

---

## 6. Cross-screen state model

One shared client-side store (owned by `features/board/hooks`, read by `accept-gate` and
`availability` via their own hooks that select from it — no cross-feature imports of internals,
per ADR-0018/CLAUDE.md "contexts communicate via events, never direct imports"):

- `orders: Map<orderId | idempotencyKey, OrderTicket>` — patched in place by SSE events, is the
  single source of truth backing the board columns, the accept/reject modal, and the ticket-detail
  view. Keyed by `idempotencyKey` rather than `orderId` alone specifically **because** a
  provisional ticket (§3.5, ADR-0022) has no `orderId` yet — the correlation key is the one
  identifier guaranteed to exist for the ticket's entire lifetime, provisional through confirmed,
  which is what makes the in-place swap in §3.5/backend doc §7.2 a plain map update rather than a
  find-by-fuzzy-match.
- `itemTicks: Map<orderItemId, boolean>` — folded from `item_tick` metadata events, per §1.5.
- `menuAvailability: Map<menuItemId | modifierOptionId, boolean>` — fed by the same SSE stream
  the customer webview's menu listens to for availability changes (per the resolved decision that
  Catalog owns this), so a KDS-triggered 86 and a Console-triggered 86 look identical to this store.
- `connection: { status: 'live' | 'stale' | 'reconnecting', lastEventAt: Date, outboxDepth: number,
  lanPeers: Array<{ deviceId: string, kind: 'till' | 'kds', reachable: boolean }> }` — drives
  screen 3.3 and the header dot everywhere else. `lanPeers` is new for ADR-0022: it's what lets the
  UI say something more useful than "not connected" when a Till peer is still reachable on the LAN
  even though the cloud isn't — e.g. surfacing "Till (Register 1) reachable locally" as a
  reassuring detail on the stale-connection banner rather than leaving the barista to infer it only
  from a provisional ticket eventually appearing.

No screen in this feature owns its own copy of order or availability data — every one of the 5
screens is a view over this shared store, which is what keeps the accept/reject modal, the ticket
detail view, and the board card for the same order from ever showing three different truths during
a fast sequence of taps.
