# Veyrox Food — Data Model

Postgres 16 on Neon (ADR-0002). Drizzle schema in `packages/db`. Migrations are reviewable SQL in git, forward-only, expand/contract.

**Read §1 before touching anything else.** The ledger design is what makes PRD G4 provable, and it is easy to accidentally undo.

---

## 1. The three rules this schema is built on

### Rule 1 — Materials move only through an append-only ledger

There is no `stock_on_hand` column and no `UPDATE` that changes a quantity. Every material movement is an insert into `material_ledger` with a signed `qty_delta`. Usage, void returns, waste, and manual adjustments are all rows with different `reason` values.

Voiding an order **negates the exact rows that order created**. It never recomputes from `recipes`. If it recomputed, a recipe edited between send-time and void-time would return the wrong quantity — silently, permanently, and cumulatively. That single line of design is the difference between meeting PRD §8.4's acceptance criterion and merely appearing to.

### Rule 2 — Order lines snapshot everything that could later change

`order_items` stores `unit_price_minor`, `modifier_total_minor`, `cost_snapshot_minor`, `recipe_version_id`, and `menu_price_version_id` **as of order time**. When the owner updates the price of oat milk on Tuesday, Monday's margin report does not change. Without this, every historical report is a lie that updates itself.

### Rule 3 — Money is integer minor units; costs are exact decimals

Prices, totals, and payments: `BIGINT`, piastres (1 EGP = 100). Never a float, never a decimal string.
Material costs: `NUMERIC(14,6)` in EGP, because 1g of milk costs ~0.0022 EGP and rounding at storage destroys the margin calculation. Rounding happens exactly once, at display. See ADR-0007.

---

## 2. Conventions

- PK: `uuid` v7 (`id`), time-ordered so indexes stay dense and inserts stay local.
- **Every table has `tenant_id uuid NOT NULL REFERENCES tenants(id)`** and RLS enabled, even in single-branch v1. Retrofitting this later is a migration across every table and every query. [ADR-0008]
- Timestamps: `timestamptz`, stored UTC, displayed and scheduled in `Africa/Cairo`.
- Soft deletes only where a legal or audit reason exists; otherwise real deletes with a preceding archive row.
- Every table: `created_at`; mutable tables also `updated_at` (trigger-maintained).
- Append-only tables are enforced by a `BEFORE UPDATE OR DELETE` trigger that raises, plus `REVOKE UPDATE, DELETE` from the app role. Two independent mechanisms, because this is the invariant everything else rests on.

---

## 3. Tenancy, identity, and access

```sql
tenants (
  id uuid PK, name text, slug text UNIQUE,
  timezone text NOT NULL DEFAULT 'Africa/Cairo',
  currency char(3) NOT NULL DEFAULT 'EGP',
  default_locale text NOT NULL DEFAULT 'en',      -- Q5: English-primary, Arabic secondary
  pos_mode text NOT NULL DEFAULT 'no_pos',      -- no_pos | has_pos   (PRD §8.5.5)
  tax_registration_number text,                  -- e-invoicing readiness; owner-editable
  wa_phone_number_id text,                       -- official rail
  qr_token text UNIQUE,                          -- ONE store QR, v1 (FR-1.1)
  qr_token_previous text,                        -- honoured during the 30-day
  qr_token_rotated_at timestamptz,               --   grace window (FR-1.5)
  status text NOT NULL DEFAULT 'active',         -- active | suspended
  created_at timestamptz
)

store_hours ( id, tenant_id, weekday int, opens time, closes time,
              crosses_midnight bool )            -- GAP-04, P0
store_closures ( id, tenant_id, starts_at, ends_at, reason text )

-- v1 has ONE store QR, not one per table (FR-1.1, DEC-01), so there is no
-- table registry. The token lives on the tenant:
--   tenants.qr_token text UNIQUE
--   tenants.qr_token_previous text, qr_token_rotated_at timestamptz  -- 30-day grace, FR-1.5
-- Table service, if a café wants it, is an optional free-text label captured
-- in the webview (setting `ordering.ask_table_number`, default off) and stored
-- on the order. No registry, no per-table mapping, no CRUD surface.

staff ( id, tenant_id, display_name text, role text,          -- barista|cashier|manager|owner
        pin_hash text NOT NULL,                                -- argon2id
        active bool, created_at )                              -- GAP-06, P0

devices ( id, tenant_id, label text, kind text,               -- kds | till | both
          enrollment_token_hash text, last_seen_at,
          revoked_at timestamptz )

owner_users ( id, tenant_id, email text UNIQUE, password_hash text,  -- argon2id
              totp_secret_enc text, role text, last_login_at )

-- Configuration. Superseded by the three-layer model in ADR-0015:
--   platform_flags (Layer 1) · entitlements (Layer 2) · tenant_settings (Layer 3)
--   all defined in 13-admin-and-configuration.md §9, with setting_definitions
--   as the registry that bounds and describes every key.
-- A flat flags table cannot distinguish "Veyrox disabled this" from "not paid for"
-- from "the owner turned it off", so the UI cannot explain itself and an owner
-- write could override a platform kill switch. Hence the split.
```

`staff.pin_hash` is argon2id with a per-tenant pepper. PINs are 4–6 digits, rate-limited to 5 attempts per device per 15 minutes, and a manager PIN is required for voids, refunds, and price edits.

---

## 4. Customers

```sql
customers (
  id uuid PK, tenant_id,
  phone_e164 text NOT NULL,                    -- personal data; never logged
  phone_hash bytea NOT NULL,                   -- HMAC-SHA256, keyed; the lookup index
  wa_id text,                                  -- WhatsApp identity on the official rail
  display_name text,
  locale text DEFAULT 'en',                    -- customer-toggleable to ar-EG
  points_cache int NOT NULL DEFAULT 0,         -- DERIVED, display only; INV-4 guards it
  tier text NOT NULL DEFAULT 'bronze',         -- DERIVED
  first_order_at, last_order_at timestamptz,
  marketing_opt_in bool NOT NULL DEFAULT false,
  deleted_at timestamptz,                      -- PDPL erasure
  UNIQUE (tenant_id, phone_hash)
)

customer_suppressions (                        -- honoured by BOTH rails. INV-5.
  id, tenant_id, phone_hash bytea, scope text, -- all | habit | marketing
  reason text,                                 -- stop_keyword | complaint | dsr | manual
  created_at
)
```

`phone_hash` rather than an index on `phone_e164` means the hot lookup path never has the raw number in a query plan, a log, or a slow-query capture. The suppression table is keyed by hash for the same reason and is deliberately *separate from* `customers`, so a suppression survives customer deletion — you must not resurrect contact with someone who asked you to stop just because their record was purged.

---

## 5. Menu, recipes, and materials — the versioned core

```sql
raw_materials (
  id, tenant_id, name_ar text, name_en text,
  unit text NOT NULL,                          -- g | ml | piece
  is_perishable bool DEFAULT false,
  active bool DEFAULT true
)

material_costs (                               -- VERSIONED. PRD §8.5.3 owner-editable.
  id, tenant_id, material_id,
  cost_per_unit NUMERIC(14,6) NOT NULL,        -- EGP per `unit`
  source text,                                 -- supplier_invoice | owner_estimate | placeholder
  valid_from timestamptz NOT NULL,
  valid_to   timestamptz,                      -- NULL = current
  entered_by, created_at
)
```

> **`source = 'placeholder'` is a first-class, queryable state, and it blocks the M3 gate.**
> PRD R5 warns that illustrative costs must not reach a real owner. Making it a column rather than a note means the console can refuse to render a margin for any item whose recipe touches a placeholder cost, and the launch gate is a query rather than a memory.

```sql
menu_categories ( id, tenant_id, name_ar, name_en, sort int )

menu_items (
  id, tenant_id, category_id,
  name_en text NOT NULL, name_ar text,            -- Q5: en required, ar optional
  description_ar, description_en text,
  base_prep_seconds int NOT NULL DEFAULT 120,     -- ETA input; recalibrated nightly
  is_available bool NOT NULL DEFAULT true,        -- GAP-02 "86-ing", P0
  unavailable_until timestamptz,                  -- auto-restore next open
  active bool DEFAULT true, sort int
)

menu_item_prices (                                -- VERSIONED
  id, tenant_id, menu_item_id,
  price_minor bigint NOT NULL,
  valid_from timestamptz NOT NULL, valid_to timestamptz,
  entered_by, created_at
)

modifier_groups ( id, tenant_id, name_ar, name_en,
                  selection text,                 -- single | multi
                  min_select int, max_select int, required bool )

modifier_options (
  id, tenant_id, group_id, name_ar, name_en,
  price_delta_minor bigint NOT NULL DEFAULT 0,    -- PRD §8.2 priced deltas
  is_available bool NOT NULL DEFAULT true,
  free_for_tier text                              -- e.g. 'silver' → free alt-milk perk
)

menu_item_modifier_groups ( menu_item_id, group_id, sort )

recipes (                                          -- VERSIONED HEADER
  id, tenant_id, menu_item_id,
  version int NOT NULL,
  valid_from timestamptz NOT NULL, valid_to timestamptz,
  created_by, created_at,
  UNIQUE (tenant_id, menu_item_id, version)
)

recipe_lines (
  id, tenant_id, recipe_id, material_id,
  qty NUMERIC(14,6) NOT NULL,                      -- in material.unit
  modifier_option_id uuid NULL                     -- line applies only with this modifier
)
```

`recipe_lines.modifier_option_id` is what makes oat milk cost more than whole milk in the *cost* model and not only in the *price* model. Without it, the margin on a Large Oat Latte is wrong, which is precisely the decision PRD §8.5.3 exists to inform.

**Recipes are never edited in place.** Saving a change closes the current version (`valid_to = now()`) and inserts version+1 in one transaction. Every material deduction records the `recipe_version_id` it used.

---

## 6. Orders

```sql
orders (
  id uuid PK, tenant_id,
  order_number text NOT NULL,                  -- human-readable, per-tenant per-day sequence
  channel text NOT NULL,                       -- whatsapp | cashier          (PRD §6.3)
  customer_id uuid NULL,                       -- NULL for anonymous till orders
  table_label text NULL,                       -- free text, only if the café asks for it (FR-1.7)
  status text NOT NULL,                        -- see state machine, 01-system-design §4.3
  subtotal_minor bigint NOT NULL,
  discount_minor bigint NOT NULL DEFAULT 0,
  total_minor    bigint NOT NULL,              -- INV-3 guards this
  payment_method text,                         -- cash | visa  (recorded at collection)
  discount_code_id uuid NULL,
  promised_eta_lower_at timestamptz,
  promised_eta_upper_at timestamptz,
  accepted_at, ready_at, collected_at timestamptz,
  created_by_staff_id uuid NULL,               -- attribution (GAP-06)
  voided_by_staff_id  uuid NULL,
  void_reason text NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, order_number)
)

order_items (
  id, tenant_id, order_id, menu_item_id,
  qty int NOT NULL,
  unit_price_minor      bigint NOT NULL,       -- SNAPSHOT
  modifier_total_minor  bigint NOT NULL,       -- SNAPSHOT
  line_total_minor      bigint NOT NULL,       -- SNAPSHOT
  cost_snapshot_minor   bigint NOT NULL,       -- SNAPSHOT: computed cost at order time
  recipe_version_id     uuid NOT NULL,         -- SNAPSHOT: what was actually deducted
  menu_price_version_id uuid NOT NULL,         -- SNAPSHOT: what was actually charged
  name_snapshot_ar, name_snapshot_en text      -- so a renamed item does not rewrite receipts
)

order_item_modifiers (
  id, tenant_id, order_item_id, modifier_option_id,
  name_snapshot_ar, name_snapshot_en text,
  price_delta_minor bigint NOT NULL            -- SNAPSHOT
)

order_events (                                 -- APPEND-ONLY. The audit log.
  id, tenant_id, order_id,
  from_status text, to_status text,
  actor_type text,                             -- customer | staff | system | webhook
  actor_id uuid NULL, reason text,
  source text,                                 -- till | kds | webview | job
  metadata jsonb, created_at
)
```

Six snapshot columns look redundant until the first time an owner asks why last month's report changed. They are the physical expression of Rule 2.

---

## 7. The material ledger

```sql
material_ledger (                              -- APPEND-ONLY. The heart of G4.
  id uuid PK, tenant_id,
  material_id uuid NOT NULL,
  qty_delta NUMERIC(14,6) NOT NULL,            -- negative = consumed, positive = returned
  reason text NOT NULL,                        -- sale_deduction | void_return
                                               -- | refund_return | waste | manual_adjustment
                                               -- | stock_receipt (v2)
  order_id uuid NULL,
  order_item_id uuid NULL,
  reverses_ledger_id uuid NULL REFERENCES material_ledger(id),   -- exact-negation link
  recipe_version_id uuid NULL,
  unit_cost_snapshot NUMERIC(14,6) NULL,       -- cost at movement time, for COGS
  actor_type text, actor_id uuid, note text,
  created_at timestamptz NOT NULL
)

CREATE UNIQUE INDEX ON material_ledger (reverses_ledger_id)
  WHERE reverses_ledger_id IS NOT NULL;        -- a row can be reversed at most once
CREATE INDEX ON material_ledger (tenant_id, order_id);
CREATE INDEX ON material_ledger (tenant_id, material_id, created_at DESC);
```

`reverses_ledger_id` plus its partial unique index is the mechanism. The void routine is:

```sql
INSERT INTO material_ledger
  (tenant_id, material_id, qty_delta, reason, order_id, order_item_id,
   reverses_ledger_id, recipe_version_id, unit_cost_snapshot, actor_type, actor_id)
SELECT tenant_id, material_id, -qty_delta, 'void_return', order_id, order_item_id,
       id, recipe_version_id, unit_cost_snapshot, 'staff', :manager_id
FROM material_ledger
WHERE tenant_id = :t AND order_id = :o AND reason = 'sale_deduction';
```

No recipe lookup. No arithmetic beyond a sign flip. The unique index makes a double-void physically impossible even if the application layer's idempotency fails. INV-1 then holds by construction, and the property-based test in `packages/domain` proves it holds across arbitrary interleavings of recipe edits and voids.

**Usage reporting (PRD §8.5.2)** is `SELECT material_id, -sum(qty_delta) FROM material_ledger WHERE ...` — which automatically nets out voids, satisfying G4's "reduce stock-usage reporting error from uncaptured voids" without any separate reconciliation step.

---

## 8. Payments, loyalty, discounts

```sql
-- v1 has NO payment provider (ADR-0010). Payment is taken at the counter on
-- collection, in cash or on the café's own terminal (recorded as the `visa`
-- label, PRD §4). One row per order, written by a staff action.
payments (
  id, tenant_id, order_id,
  method text NOT NULL,                        -- cash | visa
  amount_minor bigint NOT NULL,
  taken_by_staff_id uuid NOT NULL,             -- attribution; there is no unattributed payment
  device_id uuid,
  idempotency_key text NOT NULL,
  created_at,
  UNIQUE (tenant_id, order_id),                -- INV-6: one payment per order
  UNIQUE (tenant_id, idempotency_key)
)

refunds ( id, tenant_id, order_id, payment_id, amount_minor,
          reason text, authorized_by_staff_id, created_at )   -- cash only; FR-4.8 (P1)

loyalty_ledger (                               -- APPEND-ONLY
  id, tenant_id, customer_id,
  delta int NOT NULL,                          -- + accrual, − redemption, − clawback
  reason text,                                 -- order_accrual | tier_bonus | redemption
                                               -- | void_clawback | refund_clawback | manual
  order_id uuid NULL, created_at
)

discount_codes (
  id, tenant_id, code text NOT NULL,
  kind text,                                   -- percent | fixed
  value int NOT NULL,                          -- 10 = 10% or 1000 minor
  max_redemptions int DEFAULT 1,
  redeemed_count int DEFAULT 0,
  customer_id uuid NULL,                       -- single-customer codes (win-back)
  habit_run_id uuid NULL,                      -- G3 attribution
  expires_at timestamptz,
  UNIQUE (tenant_id, code)
)
```

`discount_codes.habit_run_id` is what makes PRD G3 ("win-back → completed order ≥8%") measurable at all: redemption joins the order back to the exact send that caused it. Without it, G3 is a guess.

---

## 9. Messaging (both rails)

```sql
inbound_events (                               -- APPEND-ONLY, dedupe at the edge
  id, tenant_id NULL, rail text,               -- official | habit
  provider_message_id text NOT NULL,
  payload jsonb, received_at, processed_at, error text,
  UNIQUE (rail, provider_message_id)           -- Meta retries; this makes it free
)

outbound_messages (                            -- APPEND-ONLY
  id, tenant_id, rail text,                    -- official | habit
  customer_id, phone_hash bytea,
  purpose text,                                -- greeting | confirmation | ready | digest
                                               -- | review_request | habit_rule1 | habit_rule2
  template_name text NULL, template_category text NULL,   -- utility | marketing (R6)
  body_hash bytea,                             -- content hash, NOT the body (privacy)
  status text,                                 -- queued|sent|delivered|read|failed|suppressed
  provider_ref text, error text,
  habit_run_id uuid NULL, cost_minor bigint NULL,
  created_at, sent_at
)

habit_rules (                                  -- PRD §6.3
  id, tenant_id, key text,                     -- rule1_morning | rule2_winback
  cron text NOT NULL, timezone text DEFAULT 'Africa/Cairo',
  enabled bool, channel text NOT NULL DEFAULT 'whatsapp_web_js',   -- CHECK: locked, PRD §8.7
  target_query_key text, template_key text,
  per_customer_cooldown_days int NOT NULL DEFAULT 7,               -- PRD §8.7 P0
  daily_send_cap int NOT NULL DEFAULT 100,
  created_at, updated_at
)

habit_runs ( id, tenant_id, rule_id, started_at, finished_at,
             targeted int, sent int, suppressed int, failed int,
             replies_24h int )                 -- G5 measurement
```

Storing `body_hash` instead of the body means an operator can prove *what class of message* was sent and that it was not duplicated, without a database dump exposing every customer's conversation. Message bodies are reconstructible from `template_key` + the stored parameters when genuinely needed.

---

## 10. Reviews (R2 audit trail)

```sql
review_requests (
  id, tenant_id, order_id, customer_id,
  sent_at timestamptz,
  rating int NULL,                             -- 1..5
  rated_at timestamptz,
  routed_to text NULL,                         -- public_google | private_recovery
  gating_enabled_at_send bool NOT NULL,        -- what the flag was, at the time
  voucher_issued_discount_code_id uuid NULL,
  owner_alerted_at timestamptz
)
```

`routed_to` and `gating_enabled_at_send` exist for one reason: if the R2 risk ever materializes, we can reconstruct exactly what every customer was shown and when the policy changed. An accepted risk that cannot be audited is an unbounded risk. See `10-risk-containment.md` §3.

---

## 11. Operational tables

```sql
job_runs ( id, tenant_id NULL, job_key, started_at, finished_at,
           outcome text, items_processed int, error text, metadata jsonb )

invariant_violations ( id, tenant_id, invariant_key, detected_at,
                       details jsonb, resolved_at, resolution_note )

audit_log ( id, tenant_id, actor_type, actor_id, action, entity, entity_id,
            before jsonb, after jsonb, created_at )   -- price/recipe/flag/staff changes

daily_closeouts (                              -- PRD §8.4 EOD + G1 denominator
  id, tenant_id, business_date date,
  cash_count int, cash_total_minor bigint,
  visa_count int, visa_total_minor bigint,
  void_count int, voided_value_minor bigint,
  footfall_estimate int NULL,                  -- GAP-11 / G1: owner-entered
  closed_by_staff_id, closed_at,
  UNIQUE (tenant_id, business_date)
)
```

`daily_closeouts.footfall_estimate` is a one-field addition that turns PRD G1 from unmeasurable into measurable. G1's metric is "% of daily orders captured digitally" — a ratio whose denominator exists nowhere else in the system.

---

## 12. Read models

Materialized, refreshed by `matview.refresh` (03:00 full, every 15 min for the current day):

| View | Feeds | Notes |
|---|---|---|
| `mv_item_sales_daily` | §8.5.2 item analytics, Menu Engineering | units, revenue, COGS from snapshots |
| `mv_material_usage_daily` | §8.5.2 raw-material usage | net of voids, straight from the ledger |
| `mv_item_margin_current` | §8.5.3 recipe costing | flags any item touching a `placeholder` cost |
| `mv_customer_rfm` | Habit Engine targeting, repeat rate | recency/frequency/monetary per customer |
| `mv_hourly_demand` | ETA calibration, Forecasting, Off-Peak | item × weekday × hour |

```sql
-- The only thing the isolated habit worker can see. ADR-0003, 10-risk-containment §2.
CREATE VIEW vw_habit_targets AS
SELECT c.phone_e164, c.display_name, r.usual_item_name, d.code AS discount_code
FROM ... ;
GRANT SELECT ON vw_habit_targets TO habit_reader;
-- habit_reader has no other grant anywhere in the database.
```

---

## 13. Row-level security

Enabled on every table. Three policy shapes:

1. **Staff/owner read**: `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`, with role checks for sensitive tables (`material_costs`, `payments`, `audit_log` are owner/manager only).
2. **All writes denied** to `anon` and `authenticated`. Writes happen through the API using the service role, which is never exposed to a browser. This is P1 from `01-system-design.md` enforced at the database, so a leaked anon key cannot corrupt anything.
3. **`habit_reader`**: `SELECT` on `vw_habit_targets` only.

RLS is tested explicitly: `07-test-and-quality-strategy.md` includes a cross-tenant leak suite that asserts tenant A's JWT returns zero rows from every one of tenant B's tables. That test runs on every merge, because the day multi-branch (§8.9) ships, RLS is the only thing between two cafés' books.

---

## 14. Retention and erasure (PDPL)

| Data | Retention | On erasure request |
|---|---|---|
| `customers` | Active + 24 months | Anonymize: null the phone, name, and `wa_id`; keep the row so orders still aggregate |
| `orders`, `order_items`, `material_ledger` | 7 years (tax/accounting) | Retained, customer-detached |
| `inbound_events` raw payloads | 30 days | Purged by scheduled job regardless |
| `outbound_messages` | 24 months (hash only, no bodies) | Retained; `phone_hash` nulled |
| `customer_suppressions` | **Indefinite** | **Never deleted** — deleting an opt-out re-enables contact |

`dsr.purge` runs nightly, is fully audited, and is exercised by an integration test asserting that after erasure no table contains the phone number and every financial aggregate is unchanged.

---

## 15. Console and platform tables

Defined in `13-admin-and-configuration.md` §9 rather than here, because they belong to the configuration model rather than the transactional core:

| Group | Tables |
|---|---|
| Platform identity | `platform_users`, `platform_audit` (append-only), `impersonation_sessions` |
| Commercial | `plans`, `plan_entitlements`, `subscriptions`, `entitlements`, `usage_counters` |
| Configuration | `platform_flags` (Layer 1), `tenant_settings` (Layer 3), **`setting_definitions`** (the registry) |
| Menu drafts | `menu_revisions`, `menu_revision_changes` |

Two notes that belong with the rest of this document:

**`setting_definitions` is an allowlist, not documentation.** A key with no definition row cannot be written by any console, and a bounded key cannot be pushed past its bounds by either. This is how a platform maximum (habit send frequency, loyalty accrual rate, ETA parallelism) stays enforced in one place instead of in two UIs that will eventually disagree.

**Menu publishing is a transaction over version transitions.** `menu_revisions` stages changes; publishing walks `menu_revision_changes` and applies each as a version close/open inside one transaction, then stamps the new `menu_version` that customer sessions pin to (FR-2.2). Availability changes bypass the draft entirely and apply instantly — running out of oat milk is not a menu revision.

---

## 16. Indexing and performance notes

At pilot volume nothing here is load-bearing; these exist so the first café with two years of history does not slow down.

```sql
orders            (tenant_id, created_at DESC)
orders            (tenant_id, status) WHERE status IN ('pending','received','preparing','ready')
order_items       (tenant_id, menu_item_id, order_id)
material_ledger   (tenant_id, order_id)
material_ledger   (tenant_id, material_id, created_at DESC)
loyalty_ledger    (tenant_id, customer_id, created_at DESC)
customers         (tenant_id, phone_hash) UNIQUE
outbound_messages (tenant_id, phone_hash, purpose, created_at DESC)   -- weekly cap check
inbound_events    (rail, provider_message_id) UNIQUE
```

The partial index on live order statuses is the one the KDS hits every few seconds; it stays tiny forever because completed orders fall out of it.
