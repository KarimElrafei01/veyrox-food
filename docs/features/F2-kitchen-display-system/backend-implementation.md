# F2 — Kitchen Display System: Backend Implementation

Companion to `frontend-implementation.md` in this directory — that doc maps each of the 5 Stitch
screens to UI behavior; this one specifies every request/response, the SSE event contract, and the
concurrency/scalability reasoning behind each.

**Traces to**: FR-3.1–3.13 · `01-system-design.md` §4.3 (state machine) · `04-data-model.md` §6–7
(orders, order_events, material_ledger) · `05-api-and-integration-contracts.md` §1, §3 (existing
staff endpoint table) · ADR-0005 (SSE) · ADR-0006 (offline outbox) · ADR-0007 (money/cost
precision) · ADR-0008 (tenancy) · ADR-0010 (accept gate, no payment provider).

**Bounded context**: `code/backend/api/src/contexts/ordering`. All mutations below live in that
context's `application/` (use cases) and `interface/` (thin HTTP controllers), following the exact
naming already used by `place-order.ts` / `place-order-controller.ts`. The 86/availability
endpoint is the one exception — it's Catalog's, called out separately in §6.

**Scope note on the contract table**: `05-api-and-integration-contracts.md` §3 already lists most
of these endpoints (`accept`, `advance`, `revert`, `void`, `collect`, the SSE stream, the board
snapshot). Two gaps exist there that this feature needs and that document doesn't yet have:
**`POST /orders/:id/reject`** (FR-3.12 has no endpoint today) and **the station-count setting**
(FR-3.10 references "settable," with no persistence or endpoint specified anywhere). Both are
fully specified below (§2.3, §5) and should be merged into `05-api-and-integration-contracts.md`
and `04-data-model.md` respectively in the same pass this feature is actually built, per CLAUDE.md
working rule 4 — they are called out here rather than silently added to the canonical docs because
that merge is a real, reviewable step, not a formality.

**Concurrency scope, as decided**: this pass assumes **one active KDS session per line/tenant** —
the multi-tablet, multi-station race case (two tablets bumping the same ticket simultaneously) is
explicitly out of scope and deferred. This does **not** relax the idempotency requirements below:
a single station's own double-tap, retry-after-timeout, and offline-outbox-replay are not "the
concurrency case that's deferred" — they are ordinary reality on one tablet (FR-3.5, ADR-0006) and
every mutation here is idempotent regardless of the multi-station question. What's deferred
specifically is optimistic-locking/409-on-conflicting-writes-from-a-second-writer; revisit before
enabling >1 concurrent KDS session against the same line.

**Offline scope, since resolved (ADR-0022)**: the KDS is not merely "readable while stale" — it is
**fully operable offline**. Accept, Reject, Advance, Revert, and item-tick all work with no cloud
connectivity at all, queued in the local outbox exactly like Till's actions (ADR-0006), the only
difference being which side-effects defer: a WhatsApp send never fires until the mutation actually
reaches the server, because the server is the only thing that can enqueue it — there is no way
around that, and no requirement that there should be (the customer isn't in the room to notice a
delayed "ready" ping the same way a barista would notice a frozen board). Every action still
writes its `order_events` row **eventually**, in original order, once synced — "it logs all the
events" is satisfied by outbox replay, not by a parallel local event store that then needs its own
merge logic. Additionally, per ADR-0022, a Till order created during a **shared** internet outage
(the café's whole uplink is down, not just this one tablet's) can reach this KDS via a direct LAN
peer connection to the Till device, appearing as a **provisional** ticket ahead of any cloud sync —
see §9.

---

## 1. `GET /staff/board` — full snapshot

Used on first load and on gap-cap resync (ADR-0005) — **never polled**.

**Auth**: staff realm (`Bearer <device_jwt>` + `X-Staff-PIN-Token`), per `05-api-and-integration-contracts.md` §1.

**Response 200**:

```json
{
  "asOfEventId": 48213,
  "activeStations": 2,
  "columns": {
    "new": [ { "...": "OrderTicket, see shape below" } ],
    "received": [ "..." ],
    "preparing": [ "..." ],
    "ready": [ "..." ]
  },
  "metrics": {
    "activeTicketCount": 12,
    "delayedOver15mCount": 1,
    "avgTurnaroundSeconds": 522,
    "railCapacity": { "used": 12, "slots": 16 },
    "peakVelocityPerHour": 34
  },
  "traceId": "0af7651916cd43dd"
}
```

**`OrderTicket` shape** (one order, denormalized for the board — this is a read-model, not the raw
`orders` row):

```json
{
  "orderId": "o_9f2...",
  "orderNumber": "A-047",
  "channel": "whatsapp",
  "status": "preparing",
  "customerFirstName": "Marcus",
  "tableLabel": null,
  "fulfillment": "pickup",
  "isPriority": false,
  "placedAt": "2026-09-06T15:31:12+03:00",
  "acceptedAt": "2026-09-06T15:32:04+03:00",
  "promisedEtaUpperAt": "2026-09-06T15:43:00+03:00",
  "ageSeconds": 641,
  "ageBand": "amber",
  "items": [
    {
      "orderItemId": "oi_...",
      "qty": 2,
      "nameSnapshot": { "en": "Crispy Chicken Sando", "ar-EG": "..." },
      "modifiers": [ { "nameSnapshot": { "en": "Extra Spicy" }, "isAllergenFlag": false } ],
      "allergenNote": null,
      "ticked": false
    }
  ],
  "customerNote": "Please pack sauces separately. Ring door upon pickup.",
  "revertWindow": { "revertibleUntil": "2026-09-06T15:44:04+03:00" },
  "syncState": "confirmed"
}
```

`syncState` (`"confirmed" | "provisional" | "pending_local"`) is new for this feature, per
ADR-0022. `"confirmed"` is every ticket this endpoint would have returned before that ADR —
a real, server-persisted order. `"provisional"` and `"pending_local"` only ever appear on a
client's **locally held** copy of the board state, never in this endpoint's own response — a
`GET /staff/board` snapshot is by definition a query against the server's confirmed state, so it
cannot itself return a provisional ticket. They're documented here anyway because the client-side
`OrderTicket` type is shared end to end (§9), and a reader of this shape needs to know the full
value space even though this specific endpoint only ever emits one of the three.

`ageBand` (`green|amber|red`) and `revertWindow` are **server-computed, not client-computed** —
the client must never derive urgency color or undo-eligibility from wall-clock math against a
timestamp it fetched N seconds ago, because a tablet that's been open for hours has arbitrary local
clock drift risk and the whole point of FR-3.8's amber/red thresholds is that they're the same for
every tablet in the café. `revertibleUntil` is present only while the 60s window (FR-3.7) is still
open; its absence is exactly how the client knows to hide the "Move Back" affordance without a
separate boolean.

### 1.1 Query shape and indexing

```sql
SELECT id, order_number, channel, status, customer_id, table_label,
       placed_at, accepted_at, ready_at, promised_eta_upper_at, customer_note
FROM orders
WHERE tenant_id = $1 AND status IN ('pending','placed','received','preparing','ready')
ORDER BY placed_at ASC;
```

This is the exact partial index `04-data-model.md` §"indexes" already calls out: *"the partial
index on live order statuses is the one the KDS hits every few seconds; it stays tiny forever
because completed orders fall out of it."* Note the "every few seconds" framing in that doc predates
this feature's actual design — under SSE (ADR-0005) this query runs **once per tablet session**
(page load / gap-cap resync), not on an interval. That makes the index even less of a concern than
the data-model doc anticipated, not more — worth noting so a future reader doesn't assume this is
a hot polling path.

Items and modifiers are fetched in one follow-up query batched by `order_id IN (...)`, not N+1 per
order — a 16-slot rail is at most ~16 orders per snapshot, so this is a single indexed
`order_items` + `order_item_modifiers` join, not a scalability concern at café scale, but the batch
shape is specified here so it isn't accidentally written as a loop.

### 1.2 `ageBand` thresholds

Per FR-3.8: amber past the promised ETA (i.e. `now > promised_eta_upper_at`, or for `New`/unaccepted
tickets, past 2 minutes since `placed_at` per FR-3.13), red past 1.5× that. Computed at query time
in the application layer (`packages/domain`, pure function — no I/O, no clock captured except as an
explicit injected `now` parameter per the domain-layer purity rule), not in SQL, so the exact same
function backs both this snapshot endpoint and the SSE event enrichment in §3 — one implementation,
not two thresholds that can drift apart.

---

## 2. Ticket lifecycle mutations

All five mutations below (`accept`, `reject`, `advance`, `revert`, item-tick) share one
concurrency shape, stated once here rather than five times:

**Every mutation is a single transaction**: lock nothing beyond Postgres's normal row-level
locking implicit in an `UPDATE ... WHERE id = $1 AND tenant_id = $2` (no explicit `SELECT ... FOR
UPDATE` is needed under the single-active-writer assumption stated above), assert the current
status is a legal source state for this transition, apply the state change, append one
`order_events` row, and — only after that transaction actually commits — enqueue any side effect
(WhatsApp send, SSE publish) from the commit hook, never inline in the transaction body. This last
point is not a style preference: `05-api-and-integration-contracts.md` §3 already states it for
`advance` ("entering `ready` enqueues the customer notification inside the same transaction's
commit hook, so a rolled-back transition can never send a message") and it applies identically to
every mutation here.

### 2.1 `POST /orders/:id/accept`

Already listed in the contract table. Full contract for this feature:

**Request**:
```json
{ "idempotencyKey": "01930b2e-..." }
```

**Server, in one transaction**:
1. Lock the order row; assert `status IN ('placed', 'pending')` (WhatsApp and Till respectively —
   both converge here, per `01-system-design.md` §4.3's "both channels converge on one state
   machine").
2. Re-check availability of every line item/modifier against **current** `is_available` state —
   an item can have been 86'd in the minutes between placement and Accept (this is a real
   sequence: customer orders, kitchen runs out, barista opens the ticket to Accept and discovers
   it). If anything is now unavailable, return `409 ITEM_NO_LONGER_AVAILABLE` with the offending
   line(s) rather than accepting an order the kitchen cannot make — the client's job is to route
   the barista into a partial-reject-and-explain flow, not silently accept and disappoint the
   customer at pickup.
3. For each `order_item` × `recipe_line`, insert one `material_ledger` row,
   `reason = 'sale_deduction'`, `qty_delta = -recipe_line.qty × order_item.qty`,
   `unit_cost_snapshot` taken from the material's current cost (this is the moment
   `cost_snapshot_minor` on `order_items` gets its value if it wasn't already set at placement —
   confirm against F1's actual placement-time behavior before implementing; if F1.6 already snapshots
   cost at placement, this step only inserts ledger rows and must not re-snapshot cost a second
   time, which would violate the "computed once" spirit of the snapshot columns).
4. Set `status = 'received'`, `accepted_at = now()`, compute and store
   `promised_eta_lower_at`/`promised_eta_upper_at` (F1.4's ETA calc, evaluated fresh at Accept —
   per F1.7 §1: *"the confirmation fires on Accept, not on placement... sending an ETA before a
   barista has accepted would promise a time the kitchen has not committed to"*).
5. Append `order_events(from_status, to_status='received', actor_type='staff', source='kds')`.
6. Commit. Commit hook: enqueue the WhatsApp acceptance/confirmation message (F1.7 §1's "Accepted"
   row) and publish the SSE event (§3).

**Response 200**: the updated `OrderTicket` (same shape as §1's snapshot entries).

**Idempotency, specifically**: a replayed Accept (same `Idempotency-Key`) returns the **original
stored response** unchanged, per the platform-wide idempotency rule — it must not attempt step 3
again. This is the one mutation in this feature where getting idempotency wrong has a directly
measurable financial consequence (double-deducted milk), which is why `Idempotency-Key` dedup here
rides the same `UNIQUE (tenant_id, idempotency_key)` mechanism already proven for order placement
(`04-data-model.md` §6) rather than a bespoke per-endpoint dedup table — one mechanism, reused,
audited once.

### 2.2 Why Accept's idempotency is not "just" the status check

It's tempting to think "the status guard (`assert status IN ('placed','pending')`) already
prevents double-acceptance, because a second Accept would see `status='received'` and fail" — and
that's true for a **sequential** retry after the first one visibly succeeded. It is **not**
sufficient for two concurrent requests carrying the *same* `Idempotency-Key` racing each other
(a double-tap that fires two HTTP requests before the first one's response paints, or a client
retry-on-timeout firing while the original request is still in flight and about to succeed) — both
could read `status='placed'` before either has committed, and both would pass the guard and both
would insert `sale_deduction` rows. The idempotency-key row's `UNIQUE` constraint is what actually
closes this: the second concurrent insert on the same key hits the unique-violation and the
transaction rolls back rather than double-executing, at which point the losing request re-reads
the now-committed response and returns it as a replay. **This is the general pattern every
mutation below relies on, not something special to Accept** — Accept just makes the cost of
getting it wrong concrete and visible (real stock, really gone), which is why it's spelled out
here in full instead of just cross-referenced.

### 2.3 `POST /orders/:id/reject` — new endpoint (FR-3.12)

Not yet in `05-api-and-integration-contracts.md`; specified here in full, following `void`'s exact
shape since the two are structurally identical (a terminal, reason-coded, non-deducting decision)
minus `void`'s manager-PIN requirement, because nothing has been deducted yet:

**Request**:
```json
{ "reasonCode": "item_unavailable", "idempotencyKey": "..." }
```
`reasonCode` ∈ `too_busy | item_unavailable | closing` — the exact FR-3.12 enum, and the same enum
F1.7 §3 already documents as customer-facing.

**Server**: assert `status IN ('placed', 'pending')` (New column only — a ticket already Accepted
cannot be Rejected, it must go through Void instead, which is precisely why `01-system-design.md`
§4.3 draws `rejected` only off the pre-accept states). Set `status = 'rejected'`,
`rejection_reason = reasonCode`, `rejected_at = now()`. **No ledger rows** — INV-7 ("no `rejected`
order has any ledger rows at all") is the invariant this step must never violate, and there is
nothing to un-deduct because Accept never ran.

**Response 200**: updated ticket with `status: "rejected"`.

**Side effect**: commit hook enqueues the polite decline WhatsApp message (F1.7 §1).

**Errors**: `409 INVALID_TRANSITION` if the order already left New (e.g. a barista's Reject tap
races a second barista's Accept tap on another device — under the single-station assumption this
specific race shouldn't occur, but the guard costs nothing and is the same guard every other
transition already needs).

### 2.4 `POST /orders/:id/advance` — board taps (Received→Preparing, Preparing→Ready)

Already fully specified in `05-api-and-integration-contracts.md` §3 ("Semantics that matter"
section) — this feature adds no new behavior to it, only new **callers** (the board card tap, §1.2
of the frontend doc). Reproduced here for completeness of this doc's request/response coverage:

```json
{ "toStatus": "ready", "idempotencyKey": "..." }
```
- Already in `toStatus` → `200`, `Idempotency-Replayed: true`, current order returned. Not `409`.
- Illegal transition → `409 INVALID_TRANSITION` with `allowedTransitions: ["preparing"]` so the
  client can self-correct.
- Entering `ready` enqueues the ready-notification WhatsApp send from the commit hook (this is the
  literal mechanism behind frontend doc §4.1's "Guest Notified" panel — that panel is reading the
  outcome of exactly this step, via the outbound-message log, not a separate notification-status
  field on the order itself; confirm the read side joins to whatever table F-series messaging
  already logs sends to, rather than adding a redundant `ready_notified_at` column to `orders`).

### 2.5 `POST /orders/:id/revert` — undo (FR-3.7)

Already listed in the contract table with only "undo one step within 60s" as its description.
Full contract:

**Request**:
```json
{ "idempotencyKey": "..." }
```

**Server**:
1. Lock the order; find the most recent `order_events` row for this order where
   `to_status = orders.status` (i.e. the event that produced the current status) and
   `actor_type = 'staff'`.
2. Assert that event's `created_at` is within the last **60 seconds** (server clock, not client —
   this is the actual enforcement point the frontend doc §4.2 says the client-side countdown must
   defer to). Past 60s → `409 REVERT_WINDOW_EXPIRED`.
3. Assert the event's `from_status` is a legal state to return to (it always is, by construction —
   it's literally where the order just came from).
4. Set `status = from_status`. **Do not touch `accepted_at`, `ready_at`, or any ledger/loyalty
   row** — this is a pure status rollback, never a financial one (this is the concrete expression
   of "the reversal is logged, but ready messages already sent are not un-sent," FR-3.7).
5. Append a new `order_events` row: `from_status = <current>, to_status = <reverted-to>,
   reason = 'undo', metadata: { revertsEventId: <the event being undone> }`. This is a **new,
   additive event**, not a deletion of the original bump event — `order_events` is append-only by
   the same rule that makes the material ledger append-only, and for the identical reason: an
   auditor (or a bug report) needs to see that a revert happened, not just its net effect.

**Response 200**: updated ticket, `status` back at the prior value.

**Response 409** (`REVERT_WINDOW_EXPIRED`): includes `detail: "This can no longer be undone from
the KDS — void the order instead"`, giving the client the exact fallback copy the frontend doc
§4.2 specifies, so that message is defined once, here, not invented ad hoc in the frontend.

**Why 60 seconds is enforced server-side and is non-negotiable as a shared constant**: it appears
in exactly one place in code (`packages/domain`, exported as `REVERT_WINDOW_SECONDS` or similar),
imported by both this endpoint's guard and by any UI that renders a countdown, so the number
cannot drift between "what the button shows" and "what the server actually allows" — the two
already-different numbers visible in the Stitch mock (44s and 47s on the same conceptual control,
across two different screenshot moments) are a reminder of exactly how easily a hand-typed number
in two places goes stale relative to each other.

### 2.6 Item-tick — new lightweight mutation, event-only (no new endpoint table row needed)

Per the resolved decision (frontend doc §1.5): folded into the existing event log, not a new
table. Exposed as its own small endpoint rather than overloading `advance`, since it doesn't change
order status at all:

**`POST /orders/:id/items/:itemId/tick`**

```json
{ "ticked": true, "idempotencyKey": "..." }
```

**Server**: assert the order status is `received` or `preparing` (ticking items on a `ready` or
terminal order is meaningless — reject with `409 INVALID_TRANSITION`). Append
`order_events(from_status = to_status = <unchanged>, actor_type='staff', metadata: { action:
'item_tick', orderItemId, ticked })`. No status column changes, which is exactly why this doesn't
need the heavier accept/advance transaction shape — it's a pure audit-log append plus an SSE
publish.

**Response 200**: `{ "orderItemId": "...", "ticked": true }`.

**Read side**: current tick state for an order's items is the **last** `item_tick` event per
`orderItemId`, folded at query time in §1's snapshot query and incrementally in the SSE handler —
this is a small, bounded fold (at most a few items per ticket) and does not need a materialized
view or a denormalized column at KDS scale; revisit only if `order_events` volume per order ever
grows enough that folding becomes measurable, which is not expected here.

---

## 3. `GET /staff/stream` — SSE contract

Already an ADR-0005 mechanism; this section specifies the **event payload shapes** this feature
adds to that stream (the stream itself, its heartbeat, gap-cap, and replay behavior are entirely
specified in ADR-0005 and not repeated here).

Every event is one `order_events` row, serialized as an SSE event with `id: <order_events.id>`
(this `id` is exactly what the client echoes back as `Last-Event-ID` on reconnect):

```
id: 48213
event: order.transitioned
data: {"orderId":"o_9f2...","fromStatus":"placed","toStatus":"received","actorType":"staff","occurredAt":"2026-09-06T15:32:04+03:00","order":{ "...": "full OrderTicket, same shape as §1" }}

id: 48214
event: order.item_ticked
data: {"orderId":"o_9f2...","orderItemId":"oi_...","ticked":true,"occurredAt":"..."}

id: 48215
event: menu_item.availability_changed
data: {"menuItemId":"mi_...","isAvailable":false,"occurredAt":"..."}
```

Three distinct event names, not one generic `order.updated` — this is deliberate. A generic event
would force every client to diff the full ticket to figure out what changed, on every single
message, for a board that may be holding a dozen tickets' worth of subscriptions to redraw
decisions; named events let the client apply a targeted patch (flip one item's strikethrough,
recolor one card's border) without a diff pass, which matters here specifically because FR-3.3's
"under 1 second" propagation budget includes render time, not just network time.

`menu_item.availability_changed` is **not owned by this feature** (§6 — Catalog owns the
mutation) but **is carried on this same stream**, because the KDS board needs to know
instantly when an item it has queued becomes unavailable (§2.1 step 2's re-check-on-Accept is the
belt; this SSE event updating the "86 Items" badge live is the suspenders) — the alternative,
a second SSE connection just for availability, would cost a second long-lived connection per
tablet for no benefit, directly working against ADR-0011's near-zero-hosting-cost Phase 0 constraint
(each held connection is a real resource on a single Hetzner VPS running the whole stack).

### 3.1 Full-board snapshot event (gap-cap resync)

Per ADR-0005's "gap cap" rule, past a threshold the server sends one snapshot event instead of
replaying thousands of rows:

```
event: board.snapshot
data: { "...": "identical shape to GET /staff/board's response body" }
```

The client's handler for this event is **literally the same reducer** that processes the initial
`GET /staff/board` response on mount — not a separate code path — which is what makes "past a
gap, resync" genuinely just "reload," reusing existing code rather than adding a third state-sync
strategy to maintain.

---

## 4. Fan-out architecture and scalability

This is the section CLAUDE.md's request explicitly asked to think through. The honest answer at
this product's actual scale, stated first, then the reasoning:

**At café scale (one tenant, 2–6 KDS/Till tablets, single-digit concurrent tickets), this is not a
hard scaling problem, and building for a harder one than this would be over-engineering the
exact kind CLAUDE.md's simplicity rule warns against ("no abstraction without a second caller").**
The interesting scaling axis for Veyrox Food generally is **tenant count** (many independent
cafés), not per-tenant concurrency — and per ADR-0008, every tenant's data and every tenant's SSE
subscriptions are already isolated by `tenant_id`, so tenant count scales horizontally by adding
API instances, not by making any one tenant's board handle more load.

### 4.1 In-process fan-out (Phase 0/1, ADR-0011)

Phase 0 is one Hetzner VPS running `api`/`worker`/Redis. Within a single API process, SSE fan-out
for a given tenant's connected tablets is in-process: the commit hook that appends an
`order_events` row directly pushes to any open `EventSource` response streams subscribed to that
`tenant_id`, held in an in-memory map (`tenant_id → Set<response>`)established when the connection
opens and torn down on disconnect. This is exactly the pattern ADR-0005 already commits to and
explicitly discusses trading off against Postgres `LISTEN/NOTIFY` — *"adds a dedicated long-lived
connection per API instance... worth revisiting if we ever run enough API instances that
in-process fan-out becomes insufficient."* This feature does not change that tradeoff or revisit
it; it simply consumes it.

**The one thing this feature must get right that ADR-0005 states in the abstract**: the commit
hook publishing to the in-memory subscriber map must run **after** the transaction actually
commits, not inside it — a straightforward `pg` transaction-committed callback, not a
`pg-listen`/trigger mechanism (which ADR-0005 already rejected for Phase 0/1). Getting this
ordering wrong is the single most likely way to reintroduce ADR-0005's stated risk ("you can no
longer forget to publish") in this specific feature, since accept/reject/advance/revert/item-tick
are five separate call sites, not one — hence the explicit "test asserts that every state
transition produces a stream event" ADR-0005 already commits to; this feature adds four new
transition types to that same test, it doesn't invent new test infrastructure.

### 4.2 When this stops being enough

Multiple API instances behind a load balancer break the in-memory-map assumption the instant a
KDS tablet's SSE connection lands on instance A while the commit that should notify it happens on
instance B. This is squarely ADR-0011's Phase 2 territory (Fly.io ×2+), and ADR-0005 already names
the two upgrade paths (Postgres `LISTEN/NOTIFY`, or a managed realtime relay) without picking one
yet. **This feature does not need to pick one now** — Phase 1 (ADR-0011) is still "Fly.io ×2" for
redundancy, not necessarily concurrent multi-instance serving of the same tenant's stream, and the
right trigger for actually solving this is explicit and measurable (a real second concurrent
instance serving live SSE traffic for the same tenant), not a hypothetical drawn out in this
document. Flagging it here is enough: **do not let this feature's implementation quietly bake in
an assumption (like "SSE subscribers live in a global in-process array with no tenant sharding
consideration") that makes the Phase 2 migration harder than ADR-0005 already expects it to be** —
key the subscriber map by `tenant_id` from day one (trivial, and already implied by ADR-0008), so
the only thing Phase 2 has to change is *how* a commit on instance B reaches a subscriber on
instance A, not *how tenants are isolated* while doing so.

### 4.3 Database-level scalability

- The live-order partial index (§1.1) keeps the board query O(active tickets), which is bounded
  by the rail's own capacity display (~16 slots) regardless of how many orders a busy café
  accumulates historically — this is already true of the existing index and this feature adds no
  new hot query shape against `orders`.
- `order_events` grows without bound (append-only, by design) but every read this feature does
  against it is either (a) bounded by `Last-Event-ID` replay with the gap cap, or (b) a
  small per-order fold (§2.6) — never an unbounded scan. No new index is needed beyond what
  `04-data-model.md` presumably already has on `order_events(tenant_id, order_id, id)` for the
  replay query; confirm that index exists when this is implemented, since ADR-0005's replay query
  (`WHERE id > :lastSeen`) needs it to stay fast as the table grows tenant-wide, and the item-tick
  fold (`WHERE order_id = :o AND metadata->>'action' = 'item_tick'`) benefits from the same
  `(tenant_id, order_id)` index without requiring a separate one on the JSONB predicate at this
  volume (a handful of rows per order).
- `material_ledger` writes from Accept (§2.1) are pure inserts against an append-only table with
  existing indexes (`04-data-model.md` §7) — this feature is a new *caller* of the existing void's
  sibling pattern (insert `sale_deduction` rows), not a new write shape.

### 4.4 Concurrency correctness summary

Restating the resolved scope precisely, because "assume one station" is easy to misapply if read
too broadly:

| Scenario | In scope for this pass? | Mechanism |
|---|---|---|
| Same tablet double-taps Accept | **Yes** | `Idempotency-Key` unique constraint (§2.2) |
| Tablet retries after a network timeout, original request actually succeeded | **Yes** | Same idempotency mechanism — this is indistinguishable from a double-tap at the server |
| Tablet was offline, outbox replays a queued Accept after reconnect | **Yes** | Same mechanism again — ADR-0006 explicitly relies on this being one mechanism for "double-taps, retries, and replays" |
| A second KDS tablet on the same line accepts/bumps the same ticket concurrently | **No — deferred** | Would need optimistic concurrency (a version/updated_at precondition) or station-scoped item ownership, per the alternatives not chosen this pass |
| Two different tenants' boards interfering with each other | **N/A — already impossible** | `tenant_id` on every table/index/query, RLS (ADR-0008) — this feature adds no new attack surface here, it only adds new queries that already carry `tenant_id` like every other query in the codebase |

---

## 5. `active_stations` — new setting, new small table (FR-3.10)

FR-3.10 says active-station count is "settable on the board and feeds FR-2.19" (ETA's queue-depth
input) but neither `04-data-model.md` nor `05-api-and-integration-contracts.md` currently models
where it lives. Proposal, additive to `04-data-model.md` §"Orders" region when this is actually
built:

```sql
kitchen_state (
  tenant_id uuid PK REFERENCES tenants(id),
  active_stations int NOT NULL DEFAULT 1 CHECK (active_stations BETWEEN 1 AND 12),
  updated_at timestamptz NOT NULL,
  updated_by_staff_id uuid NULL
)
```

One row per tenant — this is deliberately **not** modeled through the ADR-0015 settings/config
resolver (`setting_definitions` / platform-capability → entitlement → preference), because that
mechanism is for configuration a device *reads* to decide behavior, not fast-changing operational
state a barista *writes* multiple times a shift as staffing changes. Forcing it through the
settings resolver would mean every stations +/- tap goes through a heavier system built for a
different access pattern (rare writes, cached reads with invalidation) for no benefit — a plain
per-tenant row with a direct endpoint is the simpler correct shape here (CLAUDE.md: "write the
simplest thing that satisfies the requirement").

**`PUT /staff/kitchen-state/stations`**

```json
{ "activeStations": 3, "idempotencyKey": "..." }
```

**Response 200**: `{ "activeStations": 3, "updatedAt": "..." }`. No `order_events` row — this
isn't an order-lifecycle fact, it's operational metadata; it does, however, need its own SSE event
(`event: kitchen_state.changed`) on the same stream so every connected tablet's stepper stays in
sync without polling, same rationale as `menu_item.availability_changed` in §3.

**Consumption by FR-2.19** (ETA queue-depth): the ETA calc (F1.4, `packages/domain`) reads this
row alongside live queue depth from the partial-index query in §1.1 — specified here as a pointer
so whoever implements F1.4's queue-depth input doesn't have to independently rediscover where
station count lives; this document does not restate F1.4's ETA formula itself.

---

## 6. `POST /menu-items/:id/availability` — 86/un-86 (owned by Catalog, called from KDS)

Per the resolved decision, this mutation belongs to the Catalog bounded context, not Ordering/KDS
— it is the same endpoint Console uses. This feature's only responsibility is to be a correct
**caller**:

**Request** (as already implied by the existing contract table row):
```json
{ "isAvailable": false, "scope": "item", "idempotencyKey": "..." }
```
`scope` distinguishes a menu item from a modifier option toggle (`"item" | "modifier_option"`,
with the target id in the URL either way — or, if Catalog's actual implementation splits these
into two URLs, this feature's frontend calls whichever Catalog actually exposes; this doc does not
prescribe Catalog's URL shape, only that KDS is a thin caller of it).

**Server** (Catalog context, not detailed here beyond what KDS needs to know): sets
`is_available = false` on the target row, effective immediately (FR-10.14 — bypasses any menu
draft/publish flow entirely), and — this is the part that matters for this feature — publishes
`menu_item.availability_changed` onto the **same staff SSE stream** this document's §3 already
specifies, plus whatever stream the customer webview's menu listens to (out of scope for this
document; F1.2 owns that side).

**What KDS's `features/availability` datasource layer needs to render §5.1/5.2 of the frontend
doc**: a `GET` of the tenant's current menu with availability flags — this is very likely
`GET /public/menu` or a staff-scoped equivalent already covering Catalog's read side (F1.2); this
document does not invent a second menu-read endpoint for KDS. If no staff-scoped menu-read endpoint
exists yet when this is built, that's a real gap to raise with whoever owns F1.2/Catalog, not
something to route around by having KDS query `orders`/`order_items` (which only reflects items
that have been *ordered*, not the full catalog a barista needs to search in the 86 drawer).

---

## 7. LAN peer relay — ADR-0022 mechanics as they touch this feature

Full rationale and the trust/discovery/reconciliation design live in
`docs/adr/ADR-0022-lan-peer-relay-for-offline-order-visibility.md`. This section is only what the
KDS backend/client boundary specifically needs to implement.

### 7.1 What the KDS receives over the LAN channel

A relayed message from a Till peer, over the local WebSocket (`ops-core`), shaped by the same
`packages/contracts` schema the real `POST /orders/:id/send-to-kitchen` body uses, plus the
correlation key:

```json
{
  "type": "order.relayed",
  "idempotencyKey": "01930b2e-...",
  "provisionalLabel": "OFFLINE-3",
  "order": { "...": "same item/modifier/customerNote shape as an OrderTicket, minus orderNumber" }
}
```

On receipt, the KDS client inserts a card into the **New** column with
`syncState: "provisional"` and `orderNumber` rendered as `provisionalLabel` instead of a real `A-0xx`
value. This card is visually distinguished (frontend doc §3, updated) so a barista is never in
doubt about which tickets are real-and-numbered versus same-room-relayed-and-pending — the two
must never be visually identical, since a barista shouting a provisional label as if it were the
real pickup number would confuse the counter handoff once the real number lands.

### 7.2 Resolving a provisional ticket to a confirmed one

Once the KDS's own SSE stream (or a board resync) delivers a `confirmed` order carrying a matching
`idempotencyKey` (exposed on the wire as `clientRef` in the `order.transitioned` event's payload,
sourced from the `orders.idempotency_key` column that already exists per `04-data-model.md` §6 —
no new column needed, just a field this feature exposes that wasn't previously serialized to
clients), the client:

1. Finds the provisional card by `idempotencyKey`.
2. Replaces its `orderNumber`, `orderId`, and `syncState: "confirmed"` in place — same DOM node,
   same column position, no re-render as a new card, no duplicate.
3. If the KDS itself had queued any mutations against that provisional ticket (§7.3), triggers
   their replay now that a real `orderId` exists.

### 7.3 KDS mutations against a still-provisional ticket

Per ADR-0022 §5, an Accept/Advance/Revert/item-tick fired against a `provisional` ticket cannot
carry a real `orderId` — there isn't one yet. The client-side outbox entry is keyed by
`idempotencyKey` (the order's correlation key) plus its own action-level `idempotencyKey` (the
mutation's own, distinct from the order's), and is held in a `syncState: "pending_local"` state:
queued, visibly so in the UI (e.g. a small "waiting to sync" tag on the affected action), but not
yet sent anywhere — there is no endpoint to send it to until the order itself has an `orderId`.
`ops-core`'s sync loop resolves these in the exact order given in ADR-0022 §5: wait for the order's
own confirmation, then replay queued mutations against the real `orderId`, oldest first.

**This feature's backend adds no new endpoint for this** — once the real `orderId` exists, replayed
mutations are ordinary calls to §2's existing endpoints (`accept`, `advance`, `revert`, item-tick),
each still carrying its own `Idempotency-Key`. The entire mechanism is a client-side sequencing
concern; the server never needs to know a ticket was ever provisional.

### 7.4 What the server-side flush actually creates

To be explicit about the one thing that must not be assumed: **the KDS never calls
`POST /orders` or `POST /orders/:id/send-to-kitchen` on Till's behalf.** Only Till's own outbox,
flushing its own queued creation request, ever produces the real order server-side. If Till's
device is lost, destroyed, or never reconnects, the provisional ticket on the KDS **never
resolves** — it stays a local, unconfirmed echo forever, which is the correct behavior (the order
was never actually placed against the system of record) even though it means a barista could be
looking at a provisional ticket for an order that, from the business's actual books, never
happened. Flag any provisional ticket older than a generous timeout (e.g. 30 minutes — long enough
to cover a real outage, short enough that it isn't mistaken for an active ticket at end of shift) with
a distinct "never confirmed — check with the till" state rather than leaving it looking like an
ordinary aging ticket.

---

## 8. Error catalogue for this feature

Extending `05-api-and-integration-contracts.md` §1's RFC 9457 shape — every `code` below is new,
added by this feature, following the existing `ITEM_UNAVAILABLE` / `PRICE_CHANGED` / `INVALID_TRANSITION` naming style:

| `code` | HTTP | When |
|---|---|---|
| `INVALID_TRANSITION` | 409 | Any mutation attempted from an illegal source status (already established by `advance`; reused verbatim by `accept`/`reject`/item-tick) |
| `ITEM_NO_LONGER_AVAILABLE` | 409 | Accept discovers a line item/modifier was 86'd after placement (§2.1 step 2) |
| `REVERT_WINDOW_EXPIRED` | 409 | Revert attempted past the 60s window (§2.5) |
| `MANAGER_PIN_REQUIRED` | 403 | Reused from Void — not new, listed for completeness since a barista attempting to fix a mistake past the revert window will hit this next |

None of the LAN relay mechanics in §7 add a new HTTP error code — by design (§7.4), the relay is a
client-side concern the server is never aware happened. The one new *client-visible, non-HTTP*
state is the "never confirmed" flag on a stale provisional ticket (§7.4), which is not an error
response at all, just a local UI state derived from age.

Every one of these carries `traceId` and, where relevant, `allowedTransitions` — per the existing
platform-wide contract, "clients switch on `code`, never on prose."

---

## 9. Tests this feature needs (per `07-test-and-quality-strategy.md`'s merge gate)

- **Property test** (`packages/domain`): for any sequence of `accept → advance* → revert? →
  advance*` interleavings, INV-1/INV-2/INV-7 continue to hold — this is a direct extension of the
  existing void property test, not a new testing strategy, and it's the right place to catch a
  revert-that-accidentally-touches-the-ledger bug before it ships.
- **Integration**: double-fire Accept with the same `Idempotency-Key` concurrently (real concurrent
  requests, not sequential) against a real Postgres — assert exactly one `sale_deduction` row set
  is written (§2.2's actual failure mode, which a sequential test cannot catch).
- **Integration**: SSE drop-mid-stream-and-reconnect (already an ADR-0005-mandated test) extended
  to assert the four new event types (`order.transitioned` with the new sub-cases,
  `order.item_ticked`, `menu_item.availability_changed`, `kitchen_state.changed`) all survive a
  gap-cap resync correctly.
- **Contract**: OpenAPI regenerates without diff after adding `reject` and
  `kitchen-state/stations` to `packages/contracts` — this is what keeps this document's two
  "not yet in 05-..." flags from silently rotting once actually merged.
- **Cross-tenant leak**: every new endpoint's `tenant_id` scoping, exercised by the existing
  cross-tenant leak suite (`07-test-and-quality-strategy.md`) — no new suite needed, these are new
  rows in the existing one. Include the mDNS discovery filter (ADR-0022 §2) explicitly: two
  devices enrolled to *different* tenants on the same physical LAN (e.g. two cafés sharing a
  building's wifi) must never discover or relay to each other — this is a genuinely new
  cross-tenant surface this feature introduces (the first one that isn't mediated by the API at
  all), so it earns its own explicit test rather than being assumed covered by the existing suite's
  API-level cases.
- **Integration (ADR-0022's named hardest case)**: both Till and KDS offline; Till creates an
  order (queued in its own outbox); it relays to KDS over a simulated LAN channel; KDS Accepts and
  Advances the provisional ticket while still offline; both devices reconnect, **in each of the two
  possible orders** (Till-first, KDS-first). Assert: exactly one real order is created, its
  `order_events` show `received → preparing` in the correct order and with the correct actor, the
  provisional card is replaced in place on the KDS (never duplicated), and no mutation is silently
  dropped in either reconnection ordering. This is the single most important test this feature
  adds — everything else here is a variation on patterns the codebase already tests well.
- **Unit**: provisional-ticket staleness flag (§7.4) flips at the timeout boundary and does not
  flip earlier, using an injected clock (domain layer purity rule — no real timers in this test).
