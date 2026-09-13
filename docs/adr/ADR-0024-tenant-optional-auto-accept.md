# ADR-0024 — Tenant-optional auto-accept for incoming orders

**Status**: Accepted · **Date**: 2026-09-13
**Related**: ADR-0010 (kitchen-accept gate this ADR adds an opt-in exception to) · ADR-0015
(configuration model this borrows a narrow slice of) · ADR-0005 (SSE — unaffected, reused as-is)

## Context

A café owner asked for the ability to skip the manual Accept/Reject decision entirely: when
turned on, every incoming order — WhatsApp customer orders and cashier/Till orders alike — should
land straight in **Received**, already accepted, with no barista tap required.

ADR-0010 added the kitchen-accept gate specifically *because* v1 has no payment provider: without
it, "anyone with WhatsApp can cause a café to consume milk, beans, and barista time with no
commitment whatsoever." That ADR's own alternatives list rejects "cash on pickup with no accept
gate" outright, calling it "the naive version of this change." **This ADR is not that alternative.**
ADR-0010 rejected removing the gate for everyone, by default, as a global simplification. This
decision is the opposite shape: the gate stays on for every café unless its own owner explicitly
opts out, for their own café, accepting the inventory risk themselves. That is a business
risk-tolerance choice about a café's own money, not a removal of a fraud control that protects the
café from someone else (contrast with "void authorization / manager PIN," which `13-admin-and-
configuration.md` §3 correctly keeps off the owner-configurable list *because* it protects the
owner from their own staff — disabling it helps no one but a dishonest employee. Auto-accept only
ever costs the owner who turned it on).

## Decision

**One tenant preference, `kitchen.auto_accept` (boolean, default `false`), covering both
channels.** Not a per-channel toggle — a café either wants the gate or does not; splitting it by
channel was considered and rejected (see Alternatives).

**When on**, an order that would otherwise land in New auto-accepts immediately: material
deductions post, the ETA clock starts, and the order appears on the KDS board already in
**Received** — functionally identical to a barista tapping Accept the instant the order lands.

**When the same availability check Accept already runs (backend doc §2.1 step 2) finds an item
86'd since placement, the order auto-rejects** with `reasonCode: 'item_unavailable'` — the customer
gets the same polite decline message a human Reject already sends (FR-3.12). There is no barista
present at that instant to route into the manual partial-reject flow, and leaving the order silently
stuck in New (Layer accepting a manual review one at a time on a channel that ADR-0010 exists to
stop such orders piling up in) would defeat the entire point of turning auto-accept on — a café that
wants zero manual steps should not get a Zeno's-paradox New column no one is watching.

**Any other failure during the auto-accept attempt (not the expected `ItemNoLongerAvailable`) leaves
the order untouched, in `placed`/`pending`, for a human to Accept/Reject manually.** The order
already exists validly at that point regardless of the setting — a transient DB hiccup during the
auto-accept follow-up must never fail the customer's already-successful placement response, and must
never auto-reject a perfectly good order on a guess.

**Every automatic decision is attributed as `actor_type = 'system'`, `actor_id = NULL`,
`source = 'auto_accept'`** on the resulting `order_events` row (and `actor_type = 'system'`,
`actor_id = NULL` on the `material_ledger` rows Accept inserts) — never a fabricated staff id. This
is a new value on both columns; `04-data-model.md`'s `order_events.actor_type` comment already
anticipated `system` as a valid actor type, it just had no caller until now. A café's audit trail
must be able to tell "a barista decided this" from "the setting decided this" apart, forever.

**Implemented as a real (if narrow) slice of ADR-0015's settings model, not a bespoke column —
but only the half of it that has a real reader today.** `tenant_settings`
(`13-admin-and-configuration.md` §9's existing schema, verbatim: `id, tenant_id, key, value jsonb,
updated_by_type, updated_by_id, updated_at`, unique on `(tenant_id, key)`) lands now as a real,
tenant-scoped, RLS-covered table — a café's chosen value for `kitchen.auto_accept` is genuine
persisted data from day one, at the exact column shape Sprint 6–7's real settings work will keep
using.

**`setting_definitions` itself is *not* added as a table in this pass.** Its entire point
(`ADR-0015` §B) is letting two consoles read the same bounds/defaults/descriptions from one place
— neither console exists yet (`code/frontends/console` is an unbuilt scaffold), so there is nothing
for a live registry row to serve today beyond this one call site. It is also not schema-free: every
other table in this codebase is tenant-scoped and RLS-covered by one blanket policy
(`drizzle/post/0030_rls.sql`, a loop over every table assuming a `tenant_id` column), and
`setting_definitions` — like `platform_flags` in the same §9 DDL — is genuinely global, no
`tenant_id` at all. Standing up that table correctly needs the same considered exception
`0040_messaging_rls.sql` already carved out for `inbound_events`, which is real work worth doing
once, for the real registry, not for a single hardcoded key. Until Sprint 6–7 lands that table for
real, `code/packages/domain`'s new `settings.ts` (the file already slated to hold the eventual
`resolveFeature()`, per `docs/13-admin-and-configuration.md` §2 and this repo's own layout notes)
carries a small `KNOWN_SETTINGS` constant with exactly the shape a `setting_definitions` row would
have — `{ key: 'kitchen.auto_accept', layer: 3, defaultValue: false, ownerEditable: true,
descriptionEn, descriptionAr }` — so the one-sentence-description discipline ADR-0015 demands is
already honored in code, not deferred along with the table.

A single-purpose reader, `getBooleanTenantSetting(db, tenantId, key, definition)`, reads
`tenant_settings` and falls back to the passed-in constant's default when no row exists — this
*is* the generic `resolveFeature()` resolver's job, done narrowly for one boolean Layer-3
preference instead of building the three-layer engine early. Migrating this one call site to a real
`resolveFeature()` (backed by a real `setting_definitions` table) once Sprint 6–7 lands is then a
mechanical follow-up — swap the reader, move `KNOWN_SETTINGS`' one entry into a seeded table row —
not a redesign. Layer 1 (`platform_flags`) and Layer 2 (`entitlements`) are untouched by this
change for the same reason stated in the settings-registry paragraph above: `auto_accept` has no
platform kill-switch and no paid-entitlement gate today because nothing about it needs one — the
risk is entirely the opting-in café's own.

**Both channels share one mechanism.** `AutoAcceptIncomingOrder` (new use case, composing the
existing `AcceptOrder`/`RejectOrder`) is the single place this logic lives, called after a
successful, non-replayed order creation. Today that is only `PlaceOrder`'s controller (WhatsApp) —
**Till/cashier order creation does not exist in code yet** (`06-sprint-plan.md` Sprint 4, unbuilt).
Till's future `send-to-kitchen` endpoint calls the same `AutoAcceptIncomingOrder` once it exists,
per FR-3.11's existing "both channels share one Accept/Reject gate" principle — this ADR does not
build Till's order creation, only the shared mechanism it will call into.

**`AcceptOrder`/`RejectOrder` gain an explicit actor** (`OrderActor = { type: 'staff'; staffId:
string } | { type: 'system' }`) replacing the old, always-human `staffId: string` parameter. Every
existing human call site (the KDS controllers) now passes `{ type: 'staff', staffId }` explicitly —
behavior is unchanged for a human tap, this is purely additive.

## Consequences

**FR updates in this pass** (`02-functional-requirements.md`): FR-3.1, FR-3.11, and FR-4.2 gain a
carve-out sentence noting the `kitchen.auto_accept` exception; FR-3.13's New-ticket escalation timer
simply does not apply to a tenant with auto-accept on, since no order ever waits in New long enough
to escalate — noted, not rewritten. `13-admin-and-configuration.md` §3's "Kitchen" owner-configurable
row gains "auto-accept incoming orders."

**The customer-facing placement response is unaffected by this change**, including for an
auto-accepted order — it still shows the standard non-committal, pre-accept shape (no promised ETA,
`startsOnAccept: true`), because that response is snapshotted before this code runs and ADR-0020's
snapshot is deliberately frozen at placement time. This is not a new staleness window: a human
barista who accepts within the same second an order lands already produces the identical
snapshot-vs-live-status gap today. The customer's live status read (F1's order-status feature)
picks up the true `received` state and real ETA moments later, exactly as it already does. Nothing
here changes that flow.

**Schedule impact** (working rule 5): this pulls a narrow slice of Sprint 6–7's settings-table work
(`tenant_settings` only — not `setting_definitions`, not the generic resolver, not Layer 1/2 tables)
forward into the Sprint 3 KDS work this change lives alongside. It does not shrink Sprint 6–7's
scope; the three-layer resolver, the real `setting_definitions` registry, and both console UIs are
still that sprint's job in full, now with one of the four tables already migrated. The Till side of
"both channels" stays blocked on Sprint 4
building Till order creation at all — `AutoAcceptIncomingOrder` is ready for it, but nothing calls
it from a Till path until that sprint lands. No screen in either Store Console or the KDS frontend
is added by this change; the setting itself has no UI to toggle it yet (see Alternatives) and
today can only be set by writing a `tenant_settings` row directly.

## Alternatives considered

**A toggle per channel** (auto-accept Till, keep WhatsApp manual, or vice versa). Rejected per the
owner's own framing of the request — a single toggle matches how a café actually thinks about the
decision ("do I trust incoming orders or not"), and a second axis of configuration for a feature
with exactly one real user-facing lever so far is exactly the "just one more toggle" sprawl
`06-sprint-plan.md`'s own risk register warns about. Nothing here blocks adding a second key later
if a real café asks for split behavior — one more `tenant_settings` key and `KNOWN_SETTINGS` entry.

**Fall back to manual New on an unavailable item, instead of auto-rejecting.** Rejected — a café
that wanted zero manual steps would end up with exactly the New-column pile-up ADR-0010's gate
exists to prevent, just moved one condition later. Auto-reject with the same `item_unavailable`
reason a human would have picked keeps the customer experience identical to today's manual-Reject
path and keeps New empty, which is the entire promise of the setting.

**Build the full ADR-0015 `resolveFeature()` resolver now, instead of a narrow reader.** Rejected
as scope creep this feature does not need — a generic three-layer engine with platform kill-switches
and paid entitlements is real, multi-sprint work (`06-sprint-plan.md` Sprint 7) for a setting that,
today, has neither a platform risk needing a kill switch nor a commercial reason to gate by plan.
Building it now to serve one boolean would be exactly the kind of unstated scope pull-forward
working rule 5 exists to prevent.

**Build a Store Console screen to toggle it.** Rejected for this pass — Store Console does not
exist yet (`code/frontends/console` is an unbuilt scaffold per the repo's own state-of-play notes).
The setting is real and toggleable via `tenant_settings` today; a console UI for it is Sprint 6–7's
console work, not a new item this ADR invents.

**A fabricated `staffId` for automatic actions** (e.g., a per-tenant "system" staff row) instead of
threading a real actor type through. Rejected — it would misrepresent every automatic decision as a
specific human's action in the audit trail forever, which is precisely the kind of "a bug or a
stolen session is not a degraded experience" honesty `13-admin-and-configuration.md` demands of
anything touching the ledger. `order_events.actor_type` already reserves `system` for exactly this;
using it costs a parameter, not a workaround.
