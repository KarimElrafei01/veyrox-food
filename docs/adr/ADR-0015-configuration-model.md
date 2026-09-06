# ADR-0015 — Three-layer configuration model, a settings registry, and versioned CRUD

**Status**: Accepted · **Date**: 2026-09-05

## Context

Two consoles now write configuration: the café owner configures their store, and Veyrox configures the fleet. Without a single model, "is feature X on for this café?" gets two answers, and the answer to "why is it off?" becomes a guess.

Separately, most of what the owner edits — prices, recipes, material costs — is **versioned reference data** (`04-data-model.md` §1). Exposing it as ordinary CRUD would either break the versioning that keeps historical reports true, or expose the versioning mechanism to a café owner who should never see the word.

## Decision

### A. Three layers, resolved in one place

```
Layer 1  PLATFORM CAPABILITY   Veyrox kill switches, legal/compliance controls
Layer 2  TENANT ENTITLEMENT    none | preview | active | suspended
Layer 3  TENANT PREFERENCE     the owner's choice
```

`resolveFeature()` in `packages/domain` is the only implementation. **Clients receive resolved state, never raw flags.** The resolution returns a reason (`platform_disabled`, `not_entitled`, `owner_disabled`), so the UI can always explain itself.

### B. A settings registry as an allowlist

`setting_definitions` holds every configurable key with its layer, type, bounds, default, whether an owner may edit it, and a one-sentence description in Arabic and English. Both consoles render their forms from it; the API validates against it.

**A setting not in the registry cannot be set by anyone.** A bounded setting cannot be pushed past its bounds by either console.

### C. Versioned CRUD, expressed as consequences

Edits to prices, recipes, and material costs create versions. Deletes of anything with history are archives. The owner-facing language describes the *consequence*, never the mechanism:

> *"New price applies to new orders. Past orders and reports keep the old price."*

### D. Draft-and-publish for menu changes

Menu edits stage in a draft revision and publish atomically as one new `menu_version`, with a diff and margin-impact view before publish. Availability (86-ing) bypasses the draft and applies instantly.

## Rationale

**Why the layer order is not negotiable.** Layer 1 winning over Layer 3 is what makes RB-9 executable: when a Google policy action arrives, review gating must stop across every café in one action, and no owner may turn it back on. Layer 2 sitting between them is what lets sales work — an owner cannot enable something unpaid, and the reason they see is a billing message rather than a generic "unavailable."

**Why a registry rather than code constants.** Two consoles reading the same bounds from the same rows is the only way "the owner can tighten the habit send window but not loosen it past the platform maximum" stays true in both UIs. Encoding bounds in UI validation means two implementations that drift; encoding them in the registry means one, enforced at the API. The registry is also the natural place to force discipline: **if a setting cannot be described in one sentence a café owner would understand, it does not get a definition row, and therefore does not exist.** That constraint is the main defence against configuration sprawl.

**Why draft-and-publish.** Without it, an owner editing prices at 08:30 publishes each keystroke's result immediately, and a customer's cart can be priced against a half-edited menu — which also makes the session-pinned `menu_version` (FR-2.2) meaningless. One transaction, one new version, in-flight sessions unaffected until their token expires.

**Why the owner-facing language avoids the mechanism.** The recipe-edit message — *"orders already in the kitchen will still return their original quantities if voided"* — is the ledger design made visible. It is the single best moment in the product to explain why the numbers can be trusted, and it does that without ever saying "version."

## Alternatives considered

**A flat per-tenant flags table** (the original plan's `feature_flags`). Rejected. It cannot distinguish "Veyrox disabled this" from "not paid for" from "the owner turned it off", so the UI cannot explain itself and support cannot answer the question. It also allows an owner write to override a platform kill switch, which is the specific thing R2 containment requires be impossible.

**Entitlements as a boolean.** Rejected — it cannot express `preview`, which PRD §8.5.4 requires ("shown with live previews before purchase"). Making preview an entitlement state rather than a special code path means the preview and the paid product run the same computation, so what sells the add-on is what the owner actually gets.

**Exposing versioning to the owner** with explicit "publish new version" language everywhere. Rejected as a UX failure. Café owners think in prices and recipes, not revisions. The draft/publish flow gives them the one place where the concept genuinely helps, and hides it everywhere else.

**Allowing hard deletes with a confirmation.** Rejected. `order_items` snapshots survive a delete, but the joins the console uses for drill-downs do not, so history silently loses its labels. Archival costs a boolean and keeps both.

## Consequences

**Good**: one answer to "is this on, and why"; kill switches that cannot be overridden; bounds enforced once; historical reports stay true through any amount of owner editing; adding a setting is a data change with a forced description rather than a code change.

**Bad**: three layers is more machinery than a flat flag table, and every new setting needs a registry row. That friction is the point — it is what keeps the surface small enough to be explainable, and the alternative is fifty toggles that nobody, including me, can reason about in two years.
