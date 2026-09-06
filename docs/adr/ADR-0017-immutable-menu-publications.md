# ADR-0017 — Immutable menu publications for customer sessions

**Status**: Accepted · **Date**: 2026-09-06

## Context

F1 customer sessions carry a UUID menu version and must show the same prices,
names, modifiers, and category ordering for their 15-minute lifetime. The
catalogue tables deliberately support owner editing, but their existing
versioned-price rows alone cannot reproduce a complete customer menu after a
category, modifier rule, item name, or sort order changes.

Using the current catalogue at read time would let a published edit change a
cart beneath a customer. Reconstructing an old menu from timestamps would be
incomplete because most catalogue fields are not temporal. Both violate
FR-2.2, FR-2.6, and F1.2's immutable CDN contract.

## Decision

Publishing creates one immutable `menu_versions` header and immutable snapshot
rows for categories, items, modifier groups, modifier options, and item/group
attachments. Snapshot rows retain the live catalogue entity IDs as their
stable identifiers; requests and `order_items.menu_item_id` therefore continue
to use the same IDs while the version supplies their historical display and
pricing facts.

The immutable artefact includes every customer-visible price, translation,
selection rule, perk rule, and sort position. It excludes availability:
`menu_items.is_available` and `modifier_options.is_available` remain live and
are served through the short-lived availability endpoint. A session may use
its pinned publication only while it remains retained. Publications are kept
for at least 30 days, well beyond the 15-minute session TTL.

Publishing atomically writes the complete snapshot and then marks it
published. It never mutates an already-published version. The version ID is in
the public menu URL, making `Cache-Control: immutable` correct without a CDN
invalidation path.

## Consequences

**Good:** current catalogue editing cannot rewrite a live cart or a cached
public menu response; session pinning is structurally enforceable; and menu
responses can be byte-identical for a version.

**Bad:** publication duplicates a small catalogue. This is bounded (roughly a
few dozen items per café), auditable, and preferable to a temporal-query model
that cannot preserve the required facts.

## Scope and schedule impact

This closes an omission in the approved F1 specification rather than adding a
product surface. No milestone moves and nothing is displaced from the explicit
cut list in `docs/00-master-plan.md`.
