# Veyrox Food — Admin Consoles & The Configuration Model

Two new surfaces:

- **Store Console** (`code/frontends/console`) — the café owner configures and manages **their** café. Expanded from the analytics-only surface in the original plan into the full operational back-office.
- **Platform Admin** (`code/frontends/admin`) — Veyrox operates and configures **the fleet**: tenants, entitlements, flags, billing, fleet health, and support tooling.

They sit on **one configuration model**, described in §2. Building that model first is what stops the two consoles from becoming two competing sources of truth about what a café's system does — which is the failure mode that turns "turn feature X off" into a support ticket nobody can answer.

---

## 1. Why this is a real addition, not a screen

It is tempting to read "admin dashboard" as CRUD forms over existing tables. Three things make it more than that, and they drive every decision below.

**1. Almost nothing here is plain CRUD.** Recipes, prices, and costs are *versioned* (`04-data-model.md` §1) because historical reports must stay true. So "edit price" is not an `UPDATE` — it closes one version and opens another. "Delete menu item" cannot be a `DELETE`, because six months of order lines reference it. The CRUD surface has to express versioning and archival in language a café owner understands, without leaking the mechanism.

**2. The current plan cannot onboard café #2.** As written, the pilot menu is seeded by a script. That is fine for one café and it is a hard blocker for the M5 gate ("second and third café onboarded with zero code changes"). Owner CRUD is not a nice-to-have that follows the pilot; **it is the thing that makes the pilot repeatable**, and part of it is therefore a pilot blocker.

**3. The Platform Admin is the highest-privilege surface in the system.** It can read every café's books, change every price, and disable every safety control. It is the one surface where a bug or a stolen session is not a degraded experience but a fleet-wide incident. It gets its own deployable, its own auth realm, and its own threat model (§8, ADR-0014).

---

## 2. The configuration model — three layers

Every behaviour in the system resolves through the same three layers, in this order:

```
  ┌─ LAYER 1: PLATFORM CAPABILITY ──────────────────────────────┐
  │ Does Veyrox allow this at all, right now?                   │
  │ Global kill switches. Legal/compliance controls.            │
  │ Set by: Platform Admin only.                                │
  │ Example: review_gating, habit_engine.channel, safe_mode      │
  └───────────────────────┬──────────────────────────────────────┘
                          ▼  if disabled → OFF, no override possible
  ┌─ LAYER 2: TENANT ENTITLEMENT ───────────────────────────────┐
  │ Has this café bought / been granted this?                    │
  │ Values: none | preview | active | suspended                  │
  │ Set by: Platform Admin (sales, billing, trials).             │
  │ Example: ai.forecasting, ai.menu_engineering, multi_branch   │
  └───────────────────────┬──────────────────────────────────────┘
                          ▼  if not entitled → OFF, owner sees an upsell
  ┌─ LAYER 3: TENANT PREFERENCE ────────────────────────────────┐
  │ Has the owner chosen to use it?                              │
  │ Set by: Store Console (owner/manager).                       │
  │ Example: upsell_prompt, digest_time, auto_86_restore         │
  └──────────────────────────────────────────────────────────────┘
```

Resolution lives in one pure function in `packages/domain`:

```ts
resolveFeature(key, { platform, entitlement, preference }): FeatureState
// Layer 1 disabled  → { enabled: false, reason: 'platform_disabled' }
// Layer 2 none      → { enabled: false, reason: 'not_entitled', upsell: true }
// Layer 2 preview   → { enabled: true,  mode: 'preview' }
// Layer 3 off       → { enabled: false, reason: 'owner_disabled' }
// otherwise         → { enabled: true,  mode: 'active' }
```

**Why the order matters.** It means a Veyrox-level kill switch cannot be overridden by an owner — which is exactly what RB-9 needs when a Google policy action arrives and review gating has to stop across every café in one action. It also means an owner can never enable something they have not paid for, and the *reason* a feature is off is always a single, explainable value rather than a guess.

The resolved state is returned to every client on session load and re-resolved on flag change (≤30s propagation, NFR-57). Clients never read raw flags; they read resolved state. A client that reasons about entitlement itself is a client that will eventually disagree with the server about what a café has paid for.

**Fail-safe rule**: if the flag store is unreachable, the last-known-good cached resolution applies. A tenant with no cache gets the **conservative default**, which is off for everything optional and on for everything on the ordering critical path. An outage must never silently enable a paid or risky feature, and must never silently disable order-taking.

---

## 3. What the store owner controls — and what they deliberately do not

This is an **allowlist, not a denylist.** The configurable surface is enumerated explicitly; anything not on the list is not configurable, and adding to the list is a deliberate decision.

### Owner-configurable

| Area | Controls |
|---|---|
| **Ordering** | WhatsApp ordering on/off · accepted payment methods (cash, visa) · max open unpaid orders · abandon window · ask-table-number · upsell prompt · cross-sell screen · minimum order value |
| **Menu** | Full CRUD (§4) · availability · draft/publish |
| **Kitchen** | Active stations default · ETA parallelism factor (bounded 0.2–0.8) · auto-advance timeouts · Gold priority sort on/off · auto-accept incoming orders on/off (`kitchen.auto_accept`, ADR-0024 — skips the manual Accept tap, at the owner's own risk) |
| **Loyalty** | Program on/off · points per EGP (bounded) · tier thresholds and multipliers (bounded) · perks per tier |
| **Discounts** | Create/expire codes · caps on depth and duration |
| **Digest** | On/off · **time of day** · recipients · language · which sections appear |
| **Review Shield** | On/off · delay minutes · the Google review URL · which staff get low-rating alerts |
| **Habit Engine** | Each rule on/off · targeting thresholds (bounded) · send window (within platform bounds) · message copy from an approved set |
| **AI add-ons** | On/off **per add-on, subject to entitlement** · purchase-order lead times · perishable classification |
| **Store** | Hours · closures/holidays · store QR download and regeneration · locale default · currency display · receipt header/footer |
| **People** | Staff CRUD · roles · PIN reset · device enrollment and revocation |
| **Notifications** | Which events alert whom, on which channel |

### Deliberately NOT owner-configurable, and why

| Not configurable | Why |
|---|---|
| **Review gating on/off** | Platform Layer-1 control. It is a legal-exposure decision (R2) that Veyrox must be able to kill fleet-wide in one action (RB-9). An owner toggling it back on after a policy action would recreate the exposure |
| **Habit Engine rail** (official vs whatsapp-web.js) | Platform control. Locked by a DB CHECK constraint (FR-7.4) and tied to R1 containment |
| **Void authorization / manager PIN requirement** | Not a preference. Disabling it re-opens the fraud vector the control exists to close (T1, GAP-04). An owner under pressure during a rush would turn it off and never turn it back on |
| **Material ledger behaviour, snapshotting, versioning** | Correctness machinery, not a feature |
| **Peak-hour surcharges** | Structurally impossible (FR-5.19, ADR-0013). Not a toggle that is set to off — a thing with no representation in the schema |
| **Retention periods below the legal floor** | PDPL and tax retention are not preferences |
| **Rate limits, caps, quiet hours on the habit rail** | Platform-bounded. An owner can tighten them; they cannot loosen past the platform maximum |
| **Their own audit log** | Read-only, always. An owner who can edit the void audit trail has no void audit trail |

The pattern in that last column: **owners configure what the product does; they do not configure what makes the product trustworthy.** Where a control is genuinely both — habit send frequency, loyalty rates, ETA factors — the owner gets a bounded range rather than a free field, with the bounds set at the platform layer.

---

## 4. Store Console — configuration and CRUD

### 4.1 Information architecture

```
Store Console
├─ Today            live board summary, alerts, system status (§4.7)
├─ Analytics        item analytics, materials, payment mix     [existing]
├─ Costing          recipe costing, margins, simulate          [existing]
├─ Menu             categories · items · modifiers · prices · availability
│                   └─ draft workspace + publish
├─ Recipes          per item, versioned, cost preview
├─ Materials        raw materials, units, supplier costs (versioned)
├─ Store            hours · closures · store QR · receipt · locale
├─ People           staff · roles · PINs · devices
├─ Marketing        loyalty · discount codes · habit rules · review shield
├─ Add-ons          entitlements, previews, on/off
├─ Settings         feature toggles, digest, notifications, integrations
└─ Account          plan, invoices, data export, DSR, audit log
```

### 4.2 Versioned CRUD, expressed in owner language

The owner never sees the word "version." They see consequences.

| Owner action | What actually happens | What the UI says |
|---|---|---|
| Change an item price | Close current `menu_item_prices` row, insert next | *"New price applies to new orders. Past orders and reports keep the old price."* |
| Edit a recipe | Close current `recipes` version, insert version+1 with new `recipe_lines` | *"Applies from now on. Orders already in the kitchen will still return their original quantities if voided."* |
| Update an ingredient cost | Close current `material_costs` row, insert next, `source` set from the picker | *"This changes the margin on 14 items. Past reports are unaffected."* |
| Delete a menu item | Archive (`active=false`); never a hard delete | *"Removed from the menu. Sales history is kept."* |
| Delete a material used by recipes | **Blocked**, with the list of recipes | *"Used in 6 recipes. Remove it from those first."* |

Three of these deserve emphasis:

**The recipe-edit message is a trust-building moment, not a warning.** It tells the owner the system knows the difference between what a drink costs today and what the pending order in the kitchen actually consumed. That is the ledger design (`04-data-model.md` §1) made visible, and it is the single best opportunity in the product to explain why the numbers can be believed.

**The cost-edit impact preview ("this changes the margin on 14 items")** is the highest-leverage safety rail in the Store Console. A mistyped cost — a decimal in the wrong place on a per-gram figure — silently rewrites every margin the owner prices against. Showing the blast radius before saving, and the recomputed margins after, catches it in the moment.

**Archival over deletion is non-negotiable.** Every `order_items` row carries `name_snapshot`, `unit_price_minor`, `cost_snapshot_minor`, and `recipe_version_id`, so history survives a hard delete — but the *joins* the console uses for drill-downs do not. Archive keeps both intact.

### 4.3 Draft and publish for menu changes

Menu edits stage in a **draft revision** and publish atomically as one new `menu_version`.

Without this, an owner editing prices at 08:30 publishes each change the instant they make it, so a customer's cart can be priced against a half-edited menu, and the session-pinned `menu_version` (FR-2.2) becomes meaningless. With it:

- Edits accumulate in a draft, visible only in the console.
- A **diff view** lists every change before publish: prices up/down, items added/archived, recipes changed, with margin impact per change.
- **Publish is one transaction** creating one new menu version. In-flight customer sessions keep their pinned version until it expires (15 min), so nobody sees a price change mid-cart.
- **Availability (86-ing) bypasses the draft entirely** and takes effect instantly, because running out of oat milk is not a menu revision (FR-2.7, FR-3.9).

Publish is blocked with a clear reason if the draft would leave an active item with no price, a recipe referencing an archived material, or a required modifier group with no options.

### 4.4 Recipes — the screen that earns the product its retention

Per menu item: material lines with quantities, **plus modifier-conditional lines** (`recipe_lines.modifier_option_id`) so a Large Oat Latte costs what it actually costs (FR-5.12).

The editor shows live, as the owner types: unit cost per line, total item cost, current price, resulting margin with the PRD's colour bands, and a **flag on any line whose material cost is a `placeholder`** — because until that is replaced with a real supplier price, no margin is shown anywhere (FR-5.14, PRD R5).

A **recipe library** of common café preparations (espresso, cortado, cold brew, standard pastry) ships as a starting point that the owner adjusts, rather than a blank grid. Recipe entry is the single most tedious part of onboarding and the most common place a café stalls — the difference between "fill in 40 recipes from scratch" and "adjust 40 pre-filled recipes" is the difference between onboarding taking an afternoon and taking three weeks of nagging.

### 4.5 Bulk operations and onboarding

- **CSV import** for menu items, materials, and recipes, with a dry-run diff before commit and per-row validation errors.
- **CSV export** of everything, for the owner's accountant and for portability.
- **Guided onboarding checklist**: store details → hours → menu → materials → **real costs** → recipes → store QR → staff → devices → test order. Progress is tracked, and the checklist is what the Platform Admin monitors during onboarding (§5.2).
- **Copy-from-template** for a new branch or a new tenant (§5.2).

### 4.6 Roles inside a store

| Role | Can |
|---|---|
| **Owner** | Everything, including costs, prices, staff, and plan |
| **Manager** | Menu availability, recipes, staff PINs, voids, EOD close. **Not** prices, costs, plan, or staff roles |
| **Cashier / Barista** | Ops app only. No console access |

Prices and costs are owner-only because they are the two fields that move money and that the fraud model (T1) cares about. A manager who can quietly change a price can quietly change a price.

### 4.7 System status — the support-load reducer

A panel on **Today** showing plain-language health of the things an owner actually experiences:

> WhatsApp ordering — **Working** · Payments — **Working** · Kitchen display — **Working** · Retention messages — **Paused by Veyrox**

Sourced from the same health checks that drive alerting (`08-operations-runbooks.md` §1). When a component is degraded it says what still works and what to do — the same content as the runbook's owner-facing sentence: *"WhatsApp ordering is down. The counter still works normally. We are on it."*

Every incident this pre-empts is a phone call I do not take at 08:30, and an owner who does not spend twenty minutes wondering whether it is their wifi.

---

## 5. Platform Admin — operating the fleet

### 5.1 Information architecture

```
Platform Admin
├─ Fleet           tenants, health, activity, revenue at a glance
├─ Tenants         lifecycle, onboarding progress, per-tenant drill-down
├─ Entitlements    plans, add-on grants, trials, previews, suspensions
├─ Flags           global kill switches, per-tenant overrides, rollouts
├─ Rails           WhatsApp official + habit rail control, template registry
├─ Health          invariants, jobs, queues, error budget, SLO burn
├─ Support         order lookup, message log, payment reconciliation, impersonation
├─ Billing         subscriptions, usage, invoices, spend (template + LLM + PSP)
├─ Content         message templates, holiday calendar, recipe library, locales
├─ Compliance      DSR queue, retention runs, review-gating posture, R1 ban log
└─ Audit           every platform action, filterable, immutable
```

### 5.2 Tenant lifecycle

`prospect → provisioning → onboarding → active → suspended → churned`

Provisioning creates the tenant, its owner user (invite email, argon2id password set on first login), its WhatsApp phone number mapping, its default flags and entitlements, and seeds the recipe library and holiday calendar. **One action, no SQL, no code change** — this is what the M5 gate actually requires.

**Onboarding progress is visible per tenant** against the §4.5 checklist, so I can see that a café has entered 40 menu items but no material costs, and intervene before they hit a costing screen with nothing in it. Onboarding stalls are the real constraint on growth (`12-team-and-operating-model.md` §6, Hire 2), and they are invisible without this view.

**Suspension** is graceful and explicitly non-destructive: ordering stops with a configured message, the Till goes read-only, data is retained. Used for non-payment. It is never a data deletion, and it is reversible in one action.

### 5.3 Entitlements and plans

Plans bundle entitlements; entitlements can also be granted individually.

| State | Meaning |
|---|---|
| `none` | Not available. Owner sees an upsell card with a live preview computed from their own data (PRD §8.5.4) |
| `preview` | Read-only output, watermarked, capped — real numbers from their data, so the preview sells itself |
| `active` | Fully enabled, owner can toggle |
| `suspended` | Was active, now off for non-payment. Distinct from `none` so the owner sees a billing message rather than an upsell |

The `preview` state exists because the PRD requires add-ons to be "shown with live previews before purchase." Making that an entitlement state rather than a special code path means the preview and the paid product run the same computation, so what the owner is shown is what they get.

### 5.4 Flags and kill switches

- **Global kill switches** (Layer 1): `safe_mode`, `review_gating`, `habit_engine`, `ai_addons`, `whatsapp_ordering`. Flippable in under 60 seconds, from a phone (NFR-57).
- **Per-tenant overrides** for staged rollout: enable a new feature for one café before the fleet.
- **Percentage rollout** by tenant hash, for anything risky.
- **Every flip is audited** with actor, reason (required, free text), and timestamp, and appears in the tenant's own audit log when it affects them.

**A hard operational rule: every flag has a CLI equivalent.** If the Admin SPA is broken during an incident — and the incident may well be a bad deploy that broke it — I must still be able to flip `safe_mode`. An admin console that is the only path to a kill switch is a single point of failure sitting on top of the recovery mechanism.

### 5.5 Rails control

**Official rail**: phone number registry per tenant, quality rating and messaging limits, template registry with approval status and category (the R6 early-warning surface), template spend per tenant against the NFR-49 alert threshold.

**Habit rail**: session health, last successful send, per-tenant send counts against caps, suppression list size, **the ban log** (R1 §2.5), and two controls that matter most —

- **Freeze** (stop sending, keep the session), and
- **Channel switch** (`whatsapp_web_js` → `cloud_api`), the escape hatch from ADR-0003.

Those two buttons are the operational expression of the entire R1 containment design. Until now they existed as flags flippable by someone who knows the flag key; putting them behind a screen with the session's health next to them is what makes RB-8 executable under stress.

### 5.6 Health and support

**Health**: open invariant violations (INV-1..INV-7) across all tenants — the top item on the page, because it is the only thing that pages at any hour — plus job success rates, queue depth, SLO burn, and error budget per tenant.

**Support tooling**, built because the alternative is me running SQL against production at 08:30, which is how data gets damaged during incidents:

- **Order lookup** by number, phone, or trace ID → full timeline from `order_events`, ledger movements, payment records, and messages sent. This is the answer to "the customer paid but has no order" (RB-2 step 4) in one screen instead of four queries.
- **Message log** — what was sent, on which rail, with what outcome. Bodies are not stored (NFR-40); template key and parameters are.
- **Order-state repair** — orders stuck in `placed` past the accept window or in `ready` past the abandon window, resolved through the same idempotent transitions the app uses. Never a hand-written status update.
- **Ledger inspector** — an order's full material history with the reversal links, for diagnosing an INV-1 violation without touching the data (RB-3 step 1: *snapshot first, do not fix yet*).

### 5.7 Billing and usage

Deliberately scoped small at this stage: **track entitlements, usage, and cost; invoice manually.**

Tracked per tenant: subscription and add-ons, orders processed, WhatsApp template spend, LLM spend against the NFR-50 cap, PSP volume, and gross margin per tenant.

Automated recurring billing (payment collection, dunning, proration) is **not built now**. At three to ten cafés, manual invoicing takes minutes a month and building subscription billing is a multi-sprint project with its own failure modes. The trigger to build it is stated so it is not a judgment call later: **when tenant count passes ~20, or when add-on revenue exceeds subscription revenue.** Until then the data needed to invoice is captured accurately, which is the part that is expensive to backfill.

### 5.8 Compliance operations

- **DSR queue** — access and erasure requests across tenants, with the audited execution path (NFR-38).
- **Retention runs** — what the nightly purge did.
- **Review-gating posture** per tenant, with the fleet-wide kill switch and the exported audit trail RB-9 needs.
- **R1 ban log** — every ban with date, number, preceding volume, and what changed. Over time this is the only real evidence about what triggers enforcement (§10-risk-containment §2.5).

---

## 6. Impersonation — the dangerous feature, designed carefully

Supporting a café often requires seeing what they see. Impersonation is the right tool and the easiest thing in this document to build irresponsibly.

**The design:**

| Control | Rule |
|---|---|
| **Read-only by default** | Sessions start read-only. Nothing can be changed |
| **Write requires escalation** | A separate action, a required reason, and a **30-minute** hard time-box |
| **Reason is mandatory** | Free text, stored, shown to the tenant |
| **Always visible** | A persistent banner on every screen naming who is impersonating and why. Never a silent session |
| **Attributed, not disguised** | Every action writes `actor_type='platform_user'` with `impersonating_tenant_id`. It is never recorded as the owner having done it |
| **Visible to the tenant** | Appears in the **owner's own audit log**, with who, when, why, and what changed |
| **Never for money** | Impersonation cannot void, refund, change a price, change a cost, or change a plan. Those require the owner, or a platform action recorded as a platform action |
| **Auto-expires** | 30 minutes, no silent renewal |

The line that matters most is **visible to the tenant**. A café owner should be able to see every time I looked at their books. That is partly ethics — it is their business data and their customers' personal data — and partly commercial: an owner who discovers silent impersonation stops trusting the product entirely, and they would be right to. Making it visible costs one table and one screen, and it converts a liability into something I can point at during a sales conversation.

The "never for money" rule exists because impersonation plus the ability to void is indistinguishable, in the audit trail, from the exact fraud pattern the void controls were built to prevent (T1) — except with more privilege.

---

## 7. Destructive-operation rails

There is no second person to review a dangerous action, so the rails have to be in the software.

| Operation | Rail |
|---|---|
| Publish a menu revision | Diff view with margin impact; blocked on validation failures |
| Change a material cost | Impact preview ("affects 14 items"), before/after margins, versioned so it is reversible by adding a new version |
| Archive a menu item | Confirmation naming the sales history that is retained; reversible |
| Archive a material | **Blocked** if referenced by an active recipe, listing the recipes |
| Reset a staff PIN | Audited; the staff member must set a new one at next use |
| Revoke a device | Immediate; queued offline actions are preserved and flushed on the next enrollment |
| Suspend a tenant | Typed tenant name to confirm; explicitly non-destructive; one-action reversal |
| Global kill switch | Reason required; broadcast to affected tenants' status panels |
| Delete a tenant | **Not available in the UI at all.** CLI only, with a 7-day soft-delete window and a backup verification step |

That last row is deliberate. There is no legitimate reason to make fleet-wide data destruction a button, and there are several ways a misclick or a compromised session becomes catastrophic. The soft-delete window exists so that even the CLI path is recoverable.

---

## 8. Auth and privilege

A fourth auth realm, joining the three in `09-security-privacy-compliance.md` §2:

| Realm | Mechanism | Session | Reaches |
|---|---|---|---|
| **Platform admin** | **WebAuthn hardware key, mandatory, no password fallback** | 4 hours, no "remember me" | `/admin/*` |

Rationale for the hardware key: this surface reads every café's books and can change every price. Phishing a password plus TOTP is a realistic attack on a solo operator; phishing a hardware key is not. It is also the cheapest control in this document.

**Platform roles** exist from the start even though there is one person today, because Hire 1 and Hire 2 will need scoped access and retrofitting a role model onto a live admin surface is unpleasant:

| Role | Scope |
|---|---|
| `platform_owner` | Everything, including entitlements, billing, and kill switches |
| `platform_support` | Read fleet, read-only impersonation, reconcile payments. **No** flags, entitlements, or billing |
| `platform_engineer` | Health, jobs, rails, flags. **No** billing, no impersonation |

Additional controls: every mutating admin action is audited with actor and reason; the audit log is append-only and readable by all platform roles; optional IP allowlisting; and a distinct, louder visual treatment for the Admin app so it is never mistaken for a Store Console at a glance.

---

## 9. Data model additions

Appends to `04-data-model.md`. All tenant-scoped tables keep `tenant_id`; platform tables do not have one.

```sql
-- Platform identity
platform_users ( id, email, role, webauthn_credential_id,
                 active, last_login_at, created_at )

platform_audit ( id, platform_user_id, action, target_type, target_id,
                 tenant_id NULL, reason text NOT NULL,
                 before jsonb, after jsonb, created_at )   -- APPEND-ONLY

impersonation_sessions ( id, platform_user_id, tenant_id,
                         mode text,                    -- read_only | write
                         reason text NOT NULL,
                         started_at, expires_at, ended_at,
                         actions_count int )

-- Commercial
plans ( id, key, name, price_minor, billing_period, active )
plan_entitlements ( plan_id, entitlement_key )

subscriptions ( id, tenant_id, plan_id, status,        -- trial|active|past_due|suspended|cancelled
                started_at, renews_at, cancelled_at )

entitlements ( id, tenant_id, key,
               state text NOT NULL,                    -- none|preview|active|suspended
               granted_by, granted_at, expires_at, note,
               UNIQUE (tenant_id, key) )

usage_counters ( id, tenant_id, period date, metric, value numeric )
                                                       -- orders, template_sends, llm_tokens, psp_volume

-- Configuration
platform_flags ( id, key, enabled bool, payload jsonb,
                 updated_by, reason text, updated_at )  -- Layer 1

tenant_settings ( id, tenant_id, key, value jsonb,
                  updated_by_type, updated_by_id, updated_at,
                  UNIQUE (tenant_id, key) )             -- Layer 3

setting_definitions ( key PRIMARY KEY, layer int, value_type,
                      min_value, max_value, allowed_values jsonb,
                      default_value jsonb, owner_editable bool,
                      description_ar, description_en )
```

`setting_definitions` is the mechanism behind §3's allowlist. It is the **registry of every configurable thing**, carrying its bounds and whether an owner may touch it. Both consoles render their forms from it, and the API validates against it. A setting that is not in the registry cannot be set by anyone, and a bounded setting cannot be pushed outside its bounds by either console — which is how "the owner can tighten the habit send window but not loosen it past the platform maximum" is enforced in one place rather than in two UIs that will eventually disagree.

**Menu drafts**, supporting §4.3:

```sql
menu_revisions ( id, tenant_id, status,                -- draft | published | superseded
                 created_by, published_at, published_by, note )
menu_revision_changes ( id, revision_id, entity_type, entity_id,
                        change_type, before jsonb, after jsonb )
```

Publishing walks the changes and applies them as version transitions inside one transaction, then stamps the new `menu_version` that customer sessions pin to.

---

## 10. API additions

Appends to `05-api-and-integration-contracts.md`.

**Store Console** — `/console/*`, owner/manager realm:

```
GET    /console/settings                  resolved feature state + editable settings
PUT    /console/settings/:key             validated against setting_definitions
GET    /console/menu/draft                current draft + diff vs published
POST   /console/menu/draft/changes        stage a change
POST   /console/menu/draft/publish        atomic publish → new menu_version
DELETE /console/menu/draft                discard
CRUD   /console/menu/categories|items|modifier-groups|modifier-options
CRUD   /console/materials                 cost edits are versioned
GET    /console/materials/:id/impact      "affects N items" preview
CRUD   /console/recipes/:menuItemId       PUT creates a new version
CRUD   /console/staff | /console/devices | /console/tables | /console/hours
CRUD   /console/discount-codes
GET    /console/status                    plain-language component health
GET    /console/audit                     read-only, includes platform actions on this tenant
POST   /console/import/:entity            dry_run=true returns a diff
```

**Platform Admin** — `/admin/*`, platform realm, every mutation requiring `reason`:

```
GET    /admin/fleet                       tenants + health + activity
POST   /admin/tenants                     provision (one action, no SQL)
PUT    /admin/tenants/:id/status          active | suspended
GET    /admin/tenants/:id/onboarding      checklist progress
PUT    /admin/entitlements/:tenantId/:key none|preview|active|suspended
GET    /admin/flags  ·  PUT /admin/flags/:key         global, reason required
PUT    /admin/flags/:key/tenants/:tenantId            per-tenant override
GET    /admin/rails/official              numbers, quality, templates, spend
GET    /admin/rails/habit                 session health, caps, ban log
POST   /admin/rails/habit/freeze
POST   /admin/rails/habit/channel         wwebjs | cloud_api   ← the R1 escape hatch
GET    /admin/health/invariants           open violations, all tenants
GET    /admin/support/orders/:ref         full timeline + ledger + payments + messages
POST   /admin/support/payments/:id/reconcile          calls the idempotent job
POST   /admin/impersonation               { tenantId, reason, mode } → time-boxed token
DELETE /admin/impersonation/:id
GET    /admin/billing/usage  ·  /admin/compliance/dsr  ·  /admin/audit
```

Contract rules specific to these surfaces:
- `reason` is a **required schema field** on every admin mutation, not a convention. An unaudited platform change is impossible to make.
- Impersonation tokens are a distinct token type carrying `mode` and `expires_at`; the API rejects money-affecting operations under any impersonation token (§6).
- Every mutating admin endpoint has a **CLI equivalent** in the same codebase, sharing the same domain functions (§5.4).

---

## 11. Delivery plan

Split into a **thin slice that unblocks the pilot** and **full consoles that unblock the fleet**, because the full surface is not needed to run one café but part of it is needed to run *any* café repeatably.

### Slice 1 — pilot-blocking *(Sprint 6, ~3 days)*
Tenant provisioning, global flags with reason and audit, the invariant/health view, and order lookup. Replaces the manual SQL and seed scripts I would otherwise be running against production during the pilot.

### Slice 2 — Store Console CRUD *(new Sprint 7, full sprint)*
`setting_definitions` registry and the three-layer resolver · menu CRUD with draft/publish · materials with versioned costs and impact preview · recipes with the library · hours, store QR, staff, devices · owner feature toggles · system status panel · CSV import/export and the onboarding checklist.

**This is a pilot blocker.** Without it the pilot café cannot change its own prices, add a seasonal item, or fix a recipe without messaging me — which is not a product, and it makes the M5 "zero code changes" gate unreachable.

### Slice 3 — Platform Admin full *(new Sprint 12, before GA)*
Entitlements and plans · per-tenant flags and rollout · rails control including the habit freeze and channel switch · support tooling · impersonation with its full control set · billing and usage · compliance operations · platform roles and WebAuthn.

Placed **before** M5 deliberately: going GA to multiple cafés without fleet tooling means operating them by hand, which does not scale past about three and is where data gets damaged.

### Schedule impact — stated plainly

| Milestone | Was | Now | Delta |
|---|---|---|---|
| M3 — Pilot-ready | Week 16 | **Week 18** | +2 weeks |
| M4 — Retention live | Week 20 | **Week 22** | +2 weeks |
| M5 — GA | Week 24 | **Week 28** | +4 weeks |
| M6 — AI + Has-POS | Week 32 | **Week 36** | +4 weeks |

Two additional sprints total. See `06-sprint-plan.md` for the re-sequenced plan.

Worth being direct about the trade: this is real scope, and the pilot slips two weeks for it. It is worth it, because the alternative is a pilot where every menu change is a support ticket and a GA that cannot onboard a second café — and both of those cost far more than two weeks once they are load-bearing.

---

## 12. What could go wrong

| Risk | Mitigation |
|---|---|
| **The Admin console becomes the only way to operate**, and breaks during an incident | Every admin action has a CLI equivalent sharing the same domain functions (§5.4) |
| **Owner misconfigures themselves into a broken state** — no prices, no hours, loyalty at 100 points per EGP | Bounded ranges in `setting_definitions`; publish validation; a one-action "restore defaults" per section |
| **Configuration sprawl** — dozens of toggles nobody understands | The registry is an allowlist. Adding a setting requires a definition row with a description in both languages. If it cannot be described in one sentence to a café owner, it is not a setting |
| **Impersonation misused or breached** | §6 in full: read-only default, time-box, mandatory reason, tenant-visible, never for money |
| **Admin session compromise** = fleet compromise | WebAuthn mandatory, 4-hour sessions, scoped roles, full audit, no UI path to tenant deletion |
| **Two consoles disagree** about what a café's system does | One resolver, one registry, one API. Clients receive **resolved state**, never raw flags |
| **The config layer becomes a way to disable safety controls** | Layer 1 controls and correctness machinery are not in the owner-editable allowlist (§3), and that list is enforced by `setting_definitions.owner_editable`, not by UI omission |
