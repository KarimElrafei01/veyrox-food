# Veyrox Food — API & Integration Contracts

The API is the single write path (`01-system-design.md` P1). Everything below is generated from Zod schemas in `packages/contracts`, so the OpenAPI document cannot drift from the implementation.

---

## 1. Conventions

- Base: `https://api.veyroxai.com/v1`. Versioned in the path; breaking changes mint `/v2` and run both for one release cycle.
- **Auth realms**: `Bearer <session_token>` (customer, HMAC-signed, 15-min), `Bearer <device_jwt>` + `X-Staff-PIN-Token` (staff), `Bearer <session_jwt>` (owner & platform admin). Realms never overlap; a device token cannot reach console endpoints.
- **Idempotency**: every mutating request carries `Idempotency-Key` (UUIDv7, client-generated). A replay returns the **original stored response** with `Idempotency-Replayed: true`, never a 409.
- **Errors** are RFC 9457 problem details:

```json
{ "type": "https://veyroxai.com/errors/item-unavailable",
  "title": "Item unavailable",
  "status": 409,
  "detail": "Oat milk is currently unavailable",
  "code": "ITEM_UNAVAILABLE",
  "traceId": "0af7651916cd43dd",
  "fields": { "modifierOptionId": "..." } }
```

`code` is a stable machine string; `title`/`detail` are localized. Clients switch on `code` and never on prose.
- **Money** is always integer minor units in a field suffixed `_minor`. There is no `price: 45.50` anywhere in any contract.
- **Time** is ISO-8601 with offset. The server never returns a naive timestamp.
- Every response carries `traceId` so a customer's screenshot is enough to find the trace.

---

## 2. Public (customer webview)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/public/session/:token` | Resolve session → tenant, locale, customer tier, **pinned menu version** |
| `POST` | `/public/session/locale` | Persist session customer's `en`/`ar-EG` locale; `Idempotency-Key` and monotonic body `sequence` required |
| `GET` | `/public/menu?v=:menuVersion` | Categories, items, modifier groups, availability, prices. Cacheable by version |
| `POST` | `/public/orders/quote` | Server-side price + ETA for a draft cart. **No writes.** |
| `POST` | `/public/orders` | Create order in `placed`. **No payment, no material deduction.** Returns order number and ETA |
| `GET` | `/public/orders/:id/status` | Customer-facing status check; returns status, ETA range, points to be earned |
| `POST` | `/public/reviews/:token` | Submit a rating (Review Shield) |

### `POST /public/orders/quote`

Request carries **IDs and quantities only**:

```json
{ "items": [ { "clientLineId": "...", "menuItemId": "...", "qty": 1,
               "modifierOptionIds": ["...","..."] } ] }
```

Response:

```json
{ "subtotalMinor": 14500, "discountMinor": 0, "totalMinor": 14500,
  "lines": [ { "clientLineId": "...", "menuItemId": "...", "unitPriceMinor": 11000,
               "modifierTotalMinor": 3500, "lineTotalMinor": 14500,
               "modifiers": [ { "id": "...", "priceDeltaMinor": 3500,
                                "waivedByTier": false } ] } ],
  "eta": { "lowerMinutes": 8, "upperMinutes": 12, "queueDepth": 3 },
  "loyalty": { "pointsToEarn": 17, "tier": "silver", "multiplier": 1.2 },
  "unavailable": [] }
```

**The request contains no prices.** This is FR-2.14 expressed in the contract: it is structurally impossible for a client to propose a price. `/quote` and `/orders` share one `domain.priceCart()` call, so the quoted total and the charged total cannot diverge.

`clientLineId` is a client-generated UUID identifying one draft-cart line. It is echoed in both `lines` and `unavailable`, allowing the webview to reconcile duplicate menu items with distinct modifiers without relying on response position. `unavailable` returns items or modifiers that went out of stock between menu load and quote, so the webview can correct the cart rather than fail at checkout.

### `POST /public/orders`

Same body plus `idempotencyKey` and `sessionToken`. Server behaviour:

1. Validate session (unexpired, tenant matches, menu version still resolvable).
2. Re-price server-side. If the total differs from a client-supplied `expectedTotalMinor` (optional, advisory), reject with `PRICE_CHANGED` and return the new quote — never silently charge a different amount.
3. Re-check availability, store hours, and flags.
4. Insert `orders` + `order_items` **with all six snapshot columns** (`04-data-model.md` §6).
5. Enforce the open-order cap and the no-show step-down (FR-2.23, FR-2.25).
6. Return `{ orderId, orderNumber, eta, payAt: "counter" }`. **No payment step at all** (ADR-0010).

Materials are **not** deducted here. They are deducted when a barista accepts the ticket (`POST /orders/:id/accept`), which is the gate that replaces prepayment: an order nobody has accepted has consumed nothing, so a spam order or a change of mind costs the café exactly zero.

---

## 3. Staff (Ops SPA — KDS + Till)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/staff/devices/enroll` | One-time device enrollment with an owner-issued code |
| `POST` | `/staff/pin/verify` | Exchange staff PIN for a short-lived action token |
| `GET` | `/staff/board` | Full board snapshot — used on first load and on gap-cap resync, never polled |
| `GET` | `/staff/stream` | **SSE live updates** (ADR-0005). Replay via `Last-Event-ID` |
| `POST` | `/orders` | Create a Till order (`draft`) |
| `POST` | `/orders/:id/send-to-kitchen` | `draft → pending`; queues the ticket in KDS New with no material deduction |
| `POST` | `/orders/:id/accept` | `pending → received`; **writes material deductions** |
| `POST` | `/orders/:id/advance` | Advance status; idempotent on the target state |
| `POST` | `/orders/:id/revert` | Undo one step within 60s (FR-3.7) |
| `POST` | `/orders/:id/collect` | `{ method: "cash" \| "visa" }` on a ready order → `collected` with its attributed payment |
| `POST` | `/orders/:id/void` | **Requires manager PIN token + reason code** |
| `POST` | `/orders/:id/refund` | Paid-order reversal (FR-4.8, P1) |
| `POST` | `/menu-items/:id/availability` | 86 / un-86 an item or modifier option |
| `GET` | `/reports/eod?date=` | End-of-day report |
| `POST` | `/reports/eod/close` | Close the day; requires `footfallEstimate`; blocked by unsynced or pending orders |

### `POST /orders/:id/advance`

```json
{ "toStatus": "ready", "idempotencyKey": "..." }
```

Semantics that matter:
- Already in `toStatus` → **200 with the current order**, `Idempotency-Replayed: true`. Not a 409. Baristas double-tap; the contract accommodates reality (FR-3.5).
- An illegal transition → 409 `INVALID_TRANSITION` with `allowedTransitions` in the payload, so the client can self-correct rather than guess.
- Entering `ready` enqueues the customer notification **inside the same transaction's commit hook**, so a rolled-back transition can never send a message.

### `POST /orders/:id/void`

```json
{ "reasonCode": "customer_left", "note": "left before pickup",
  "managerPinToken": "...", "idempotencyKey": "..." }
```

Server, in one `SERIALIZABLE` transaction: lock the order, assert its status is `received`, `preparing`, or `ready`, verify the manager token, insert the exact negation of the order's `sale_deduction` ledger rows (`reverses_ledger_id` set), reverse the loyalty accrual, set `voided`, append `order_events`.

Response returns `returnedMaterials` — the itemized list — so the Till can display exactly what went back, which is what makes FR-4.7's "itemized list of raw materials returned" trivially correct and gives the cashier immediate, checkable feedback.

Double-void is impossible at three layers: application idempotency, the status assertion under lock, and the partial unique index on `reverses_ledger_id`. This is deliberate belt-and-braces; it is the one operation where silent duplication would corrupt the books permanently.

---

## 4. Owner console

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/console/summary?period=` | Digest-equivalent figures |
| `GET` | `/console/items?period=` | Ranked units sold, revenue, change |
| `GET` | `/console/materials/usage?period=` | Net-of-voids usage from the ledger |
| `GET` | `/console/costing` | Per-item cost/price/margin + `hasPlaceholderCost` flag |
| `PUT` | `/console/materials/:id/cost` | **Versions** the cost; never overwrites |
| `POST` | `/console/costing/simulate` | Non-persisting +X% sensitivity (FR-5.15) |
| `GET/PUT` | `/console/recipes/:menuItemId` | Read / create a new recipe **version** |
| `GET/PUT` | `/console/menu/...` | Menu, prices (versioned), modifiers |
| `PUT` | `/console/settings/pos-mode` | `no_pos` \| `has_pos` |
| `GET` | `/console/addons` + `POST /console/addons/:key/preview` | Entitlements and live previews |
| `GET` | `/console/export?entity=&period=` | CSV export |
| `POST` | `/console/dsr` | Data-subject access or erasure request |

**Every console response carrying volume-dependent data includes:**

```json
{ "dataScope": "whatsapp_only",
  "scopeNotice": { "code": "PARTIAL_WHATSAPP_ONLY", "posName": "Foodics" },
  "data": { ... } }
```

`dataScope` is **required by the schema** on those endpoints, and the shared panel component takes it as a required prop and renders the banner itself. A developer cannot forget the banner, because omitting the field fails validation and omitting the prop fails typecheck. That is how PRD §8.5.5's "no dashboard panel may present partial data as if it were complete, under any toggle state" becomes structural rather than procedural (FR-5.25).

`GET /console/costing` returns `marginPct: null` with `hasPlaceholderCost: true` for any item touching a placeholder cost — the server refuses to compute a number the owner might act on (FR-5.14, PRD R5).

---

## 5. Webhooks (inbound)

### `POST /webhooks/whatsapp`

1. Verify `X-Hub-Signature-256` (HMAC-SHA256 over the **raw body**, constant-time compare) **before parsing**.
2. Insert `inbound_events` with `UNIQUE (rail, provider_message_id)`. A conflict means Meta retried — return 200 immediately.
3. Enqueue and **return 200 in under 500ms** (NFR-8).

No business logic runs inline. Meta retries aggressively on slow responses, and a synchronous handler turns a slow database query into a duplicate-message storm.

`GET /webhooks/whatsapp` handles Meta's `hub.challenge` verification.

### ~~`POST /webhooks/paymob`~~ — removed

There is no payment webhook in v1 (ADR-0010). **The only path to a paid order is `POST /orders/:id/collect`**, which requires a staff PIN, a payment method, and a device — so every payment in the system carries an actor. Nothing external can mark an order paid.

This deletes a whole class of incident: no forged callbacks, no replayed captures, no orders stranded between our state and a provider's, and no "the customer was charged but has no order." The trade is that the café's cash drawer is now the only external cross-check, which is why payment attribution (INV-6) and the void controls (FR-4.6) carry more weight than they did.

### `POST /internal/habit/report` (mTLS)

The isolated habit worker's only write into the main environment. Body is outcome rows only:

```json
{ "habitRunId": "...", "results": [
    { "phoneHash": "base64...", "status": "sent"|"failed"|"suppressed",
      "error": null, "sentAt": "..." } ] }
```

Note it carries **phone hashes, not phone numbers** — the main side already knows the mapping, and the boundary should never carry more personal data than it must. The endpoint accepts nothing else, and the habit worker holds no credential for any other route.

---

## 6. Live updates — SSE server push

`GET /staff/stream` (device JWT). The connection stays open; the server pushes each `order_event` as it commits. **No polling anywhere** (ADR-0005).

```
event: order.status
id: 4822
data: {"orderId":"...","status":"ready","updatedAt":"...","queueDepth":3}

: heartbeat            ← every 20s, or proxies kill the connection
```

**Reconnect and replay.** `EventSource` reconnects automatically and sends `Last-Event-ID`. The server replays `order_events` after that id, then resumes live — so a wifi blip loses nothing. Past `STREAM_GAP_CAP` events (default 500), the server sends one `board.snapshot` event instead of replaying, then resumes. That is a resync, not a poll.

Required response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Flush per event.

Event types:

| Event | Payload | Consumer |
|---|---|---|
| `order.status` | Order insert/update (status, item summary) | KDS, Till |
| `queue.depth` | Queue depth + active stations | ETA, KDS header |
| `menu.availability` | 86 / un-86 changes | Till, KDS |
| `board.snapshot` | Full board — sent on gap-cap overflow only | KDS, Till |

**Ordering safety.** Every payload carries `updatedAt`; the client discards anything older than what it already holds. Replay is idempotent by construction — applying the same `order_events` row twice yields the same state — so a duplicated event during reconnect is harmless.

**The staleness banner stays** (FR-3.6). Push does not remove the need for staff to know the board is not live; that requirement was never about polling. If no event or heartbeat arrives within 25s, the banner shows and names the age of the last update.

**Why this is streamable at all**: `order_events` is append-only and sequenced because every transition must be auditable (P2). The audit log and the event stream are the same table — no separate event store, no outbox, no dual-write.

---

## 7. Third-party integration contracts

### WhatsApp Cloud API (official rail)

| Aspect | Decision |
|---|---|
| UI mechanism | **CTA-URL button → hosted webview.** Flows evaluated and deferred to v2 (ADR-0003) — full control over a stateful cart, one codebase, and shared `packages/ui`/`i18n` for RTL. Worth revisiting now that no browser-based payment step is required |
| Inside 24h window | Free-form: greeting, confirmation, ready ping, review request. Free |
| Outside 24h window | Templates only. **Nightly Digest** submitted as **Utility** (PRD R6 — submitted Sprint 6 so a reclassification is a September pricing decision, not a December blocker) |
| Habit Engine | **Never** on this rail (PRD §8.7, enforced by a DB CHECK constraint) |
| Numbers | Ordering number and habit number are **different numbers on different infrastructure**. This is R1-mitigation and it is non-negotiable |

### Payments — none

| Aspect | Decision |
|---|---|
| Integration | **None in v1** (ADR-0010). No PSP, no card flow, no webhook |
| Methods | `cash` and `visa`, both recorded at the counter. `visa` is a reconciliation label for the café's own terminal (PRD §4), never an integration |
| Truth | A staff action at the counter, always attributed. One payment per order (INV-6) |
| Failure | Not applicable — there is no external payment dependency to fail |
| Refunds | Manual cash refund with a manager PIN (FR-4.8) |
| Deferred | The full Paymob design is retained in ADR-0010 as the v2 path. Nothing in v1 forecloses it |

### Foodics (Has-POS track, Phase 5)

| Aspect | Decision |
|---|---|
| Direction | **Read-only.** No write-back in v1 (PRD §4) |
| Auth | OAuth, café-authorized. Requires an eligible plan (PRD R4) — a sales gate, surfaced in onboarding before any integration work begins |
| Model | Poll orders on a schedule into a staging table, then map into the same read models. Foodics data is **tagged by source** and never silently merged into WhatsApp-channel figures |
| Failure | Stale-data banner with a last-synced timestamp. Never show Foodics-derived numbers as current when the sync is behind |

### Claude API (AI add-ons)

| Aspect | Decision |
|---|---|
| Model | `claude-sonnet-5` for narrative generation; `claude-haiku-4-5-20251001` where latency matters more than nuance |
| Scope | **Phrasing only.** All numbers are computed in TypeScript and passed in; the prompt instructs restatement and forbids derivation |
| Output | Structured output with a Zod schema; a response failing validation is discarded and the deterministic table is sent alone |
| Guardrails | Per-tenant monthly spend cap with a hard cutoff; the deterministic payload is stored alongside every generated string for reconstructibility (FR-5.21) |
| Privacy | No customer phone numbers or names are ever sent to the model — only aggregates |

---

## 8. Contract testing

| Provider | How the contract is verified |
|---|---|
| Meta | A recorded corpus of real webhook payloads — text, button reply, status update, **duplicate**, **out-of-order**, and malformed — replayed on every merge. Duplicates must produce exactly one effect |
| Payments | No provider to contract-test. Covered instead by integration tests: one payment per order, every payment attributed, no path to paid without a staff actor, and idempotent collection under replay |
| Foodics | Recorded order payloads; a sandbox smoke test before each release touching the integration |
| Claude | Golden-file tests on prompt construction; a schema-violation test asserting graceful degradation to the table |

Our own API contract is enforced by generating the OpenAPI document from the Zod schemas in CI and failing the build if the committed document differs — which makes an undocumented breaking change impossible to merge.
