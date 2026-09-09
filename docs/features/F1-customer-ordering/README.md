# F1 — Customer Ordering (WhatsApp Webview)

The customer-facing ordering flow: QR scan → WhatsApp → webview → cart → order placed. Everything up to the barista's Accept.

**Traces to**: PRD §8.1, §8.2 · FR-1.x, FR-2.x · ADR-0003 (webview), ADR-0005 (SSE), ADR-0010 (no payment), DEC-01 (single store QR).

---

## 1. Subfeature map

| ID | Subfeature | Doc | Owns |
|---|---|---|---|
| **F1.1** | Session & entry | [F1.1-session-and-entry.md](F1.1-session-and-entry.md) | QR → inbound webhook → greeting → signed session token → session resolve |
| **F1.2** | Menu & catalog | [F1.2-menu-and-catalog.md](F1.2-menu-and-catalog.md) | Versioned immutable menu, live availability, the cache split |
| **F1.3** | Cart & pricing | [F1.3-cart-and-pricing.md](F1.3-cart-and-pricing.md) | Modifier resolution, tier waivers, server-side quote |
| **F1.4** | ETA | [F1.4-eta.md](F1.4-eta.md) | Queue state, prep estimation, the promised range |
| **F1.5** | Loyalty | [F1.5-loyalty.md](F1.5-loyalty.md) | Tiers, perks, points preview and accrual |
| **F1.6** | Order placement | [F1.6-order-placement.md](F1.6-order-placement.md) | No-show gates, snapshots, idempotent creation |
| **F1.7** | Order status | [F1.7-order-status.md](F1.7-order-status.md) | Post-placement status for the webview |

Everything after placement — Accept, prepare, ready, collect — is **F2 (Kitchen)** and **F3 (Till)**, not this feature.

---

## 2. The caching architecture

This is the most important design decision in F1, so it sits here rather than buried in F1.2.

**The menu is the hot read and it is almost entirely static.** A café changes prices weekly; customers load the menu hundreds of times a day. But *availability* changes several times daily and must be current — oat milk running out has to reach the next customer immediately.

Serving both from one endpoint forces the whole payload to the shorter TTL, which throws away the caching win. So they are split:

| Endpoint | Volatility | Cache | Served from |
|---|---|---|---|
| `GET /public/menu/:menuVersion` | **Immutable** — a version never changes | `public, max-age=31536000, immutable` | **CDN edge. Zero API load, zero DB reads** |
| `GET /public/availability` | Seconds | `public, max-age=5, stale-while-revalidate=30` | API + Redis |

Because `menuVersion` is in the *path*, publishing a new menu revision (FR-10.12) mints a new URL. There is no invalidation to get wrong — old URLs stay valid for sessions still pinned to them, which is exactly the behaviour FR-2.2 requires.

**Consequence for the client**: the webview merges the two on load, and re-fetches only availability on focus. A cold menu load is one CDN hit; a returning customer inside the same menu version pays nothing.

---

## 3. Indexing summary

Every index F1 depends on. Each is justified in its subfeature doc; collected here so the migration is reviewable in one place.

```sql
-- Session & customer lookup (F1.1)
customers            (tenant_id, phone_hash) UNIQUE
tenants              (qr_token) UNIQUE
tenants              (qr_token_previous) WHERE qr_token_previous IS NOT NULL

-- Menu assembly (F1.2) — only touched on a cache miss
menu_items           (tenant_id, category_id, sort) WHERE active
menu_item_prices     (tenant_id, menu_item_id) WHERE valid_to IS NULL   -- current price
modifier_options     (tenant_id, group_id, sort) WHERE active
menu_item_modifier_groups (menu_item_id, sort)

-- Availability (F1.2) — small, hot
menu_items           (tenant_id) WHERE NOT is_available          -- the 86 list is short
modifier_options     (tenant_id) WHERE NOT is_available

-- ETA queue depth (F1.4)
orders               (tenant_id, status) WHERE status IN ('placed','received','preparing')

-- No-show and open-order gates (F1.6)
orders               (tenant_id, customer_id, status)
                       WHERE status IN ('placed','received','preparing','ready')
orders               (tenant_id, customer_id, created_at DESC) WHERE status = 'abandoned'

-- Loyalty (F1.5)
loyalty_ledger       (tenant_id, customer_id, created_at DESC)

-- Idempotency (F1.6)
orders               (tenant_id, idempotency_key) UNIQUE
```

**Partial indexes are used deliberately.** `orders (tenant_id, status) WHERE status IN (live)` stays tiny forever — completed orders fall out of it — so ETA queue depth is an index-only scan over tens of rows regardless of how much history a café accumulates.

---

## 4. Scalability notes

Restating the honest scale from `03-non-functional-requirements.md`: one café peaks at ~40 orders/hour. **F1 is not throughput-constrained.** These notes exist so that the *shape* stays right as cafés multiply, not because current volume demands them.

| Concern | Approach |
|---|---|
| Menu reads | CDN-cached by version. Scales to any number of cafés at zero marginal cost |
| Availability reads | Redis, keyed `avail:{tenantId}:{menuVersion}`, invalidated on 86 events. Payload is a short ID list, typically under 1 KB |
| Queue depth for ETA | Maintained in Redis by the domain event bus, not counted per request. See F1.4 §4 |
| Quote computation | Pure function over cached menu + cached queue. No database round-trip on the happy path |
| Order placement | The only write. One transaction, four inserts. Bounded by Postgres, nowhere near a limit |
| Session tokens | Stateless HMAC. No lookup, no storage, no shared state — so the API scales horizontally without sticky sessions |

**The deliberate non-goal**: no read replica, no sharding, no separate cache tier beyond Redis. Adding them now would be building for a load that does not exist, against the T3 principle.

---

## 5. Error codes

Every `code` F1 can return. Stable machine strings; clients switch on these, never on prose (`05-api-and-integration-contracts.md` §1).

| Code | HTTP | Meaning |
|---|---|---|
| `SESSION_EXPIRED` | 401 | Token past its 15-minute TTL. Client shows a re-open prompt |
| `SESSION_INVALID` | 401 | Signature failed or tenant mismatch |
| `STORE_CLOSED` | 409 | Outside `store_hours` or inside a closure. Response carries `opensAt` |
| `ITEM_UNAVAILABLE` | 409 | Item or modifier 86'd since menu load. Response carries the offending IDs |
| `MODIFIER_GROUP_REQUIRED` | 422 | A required group had no selection |
| `MODIFIER_SELECTION_INVALID` | 422 | Below `minSelect` or above `maxSelect` |
| `MENU_VERSION_GONE` | 409 | Pinned version no longer resolvable. Client reloads the session |
| `PRICE_CHANGED` | 409 | Advisory `expectedTotalMinor` did not match. Response carries the new quote |
| `OPEN_ORDER_LIMIT` | 409 | Customer already has an uncollected order (FR-2.23) |
| `ORDERING_SUSPENDED` | 403 | No-show step-down active (FR-2.25). Response says counter-only |
| `MIN_ORDER_VALUE` | 422 | Below the tenant's configured minimum |
| `WHATSAPP_ORDERING_DISABLED` | 403 | Feature resolved off — carries the reason from `resolveFeature()` |

---

## 6. What F1 must never do

- **Accept a price from the client.** Request contracts carry IDs and quantities only. Not a validation rule — a schema fact.
- **Deduct materials.** Nothing in F1 touches `material_ledger`. Deduction happens on barista Accept (F2), which is what makes an abandoned cart cost the café nothing.
- **Mark anything paid.** No payment exists in v1 (ADR-0010).
- **Trust `menuVersion` from the client** without confirming the session token pinned it.
- **Write outside a single transaction** in F1.6. Order header, lines, modifiers, and event go together or not at all.

---

## 7. Webview app (`code/frontends/order`)

The frontend lives in `code/frontends/order`, feature-first with the six folders from ADR-0018
(`ui/` · `components/` · `hooks/` · `usecases/` · `repo/` · `datasource/`). One feature folder per
subfeature: `session/` (entry + the closed / suspended / open-order-block / expired states), `menu/`,
`item/`, `cart/`, `checkout/`, `order-status/`, plus `loyalty/` (presentational — its data rides on
session, quote, and status).

Design system in `packages/ui` (Brew & Baladi tokens, CSS Modules, RTL via logical properties).
Copy in `packages/i18n` (`en` default, `ar-EG`; Western Arabic numerals for money and counts). The
`datasource/` layer calls the `/public/*` endpoints in each subfeature's §2 through
`packages/api-client`'s HTTP client, parsing every response against a `packages/contracts` schema;
`repo/` maps those DTOs to what each feature holds.

`order` never polls (ADR-0005): the status screen fetches once on placement and once on window
focus; WhatsApp messages are the real post-placement channel (F1.7 §1).
