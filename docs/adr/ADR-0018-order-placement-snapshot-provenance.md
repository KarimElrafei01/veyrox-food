# ADR-0018 — Placement freezes catalogue provenance

**Status**: Accepted · **Date**: 2026-09-06

## Context

F1.6 makes placement, rather than kitchen accept, the point at which an order
records its charged price, recipe and cost facts. Those facts must not be
reconstructed after a later catalogue edit.

## Decision

Placement reads the session-pinned publication for the customer-visible price
and names, then records the active price-version and recipe-version identifiers
with the calculated cost on every `order_items` row in the same transaction as
the order and its event. A missing active price or recipe rejects placement as
a catalogue configuration error; it is never silently replaced with a current
or zero-value fact.

`customer_note` is persisted on `orders` because it is a ticket fact, bounded
at the public API boundary, and is never parsed as an instruction.

Two supporting decisions fall out of the same change:

- **The shouted `order_number` is a per-`(tenant, Cairo day)` sequence**, taken
  from an `order_number_counters` row with an upsert that `RETURNING`s the
  number. Concurrent placements serialise on that row rather than racing the
  `orders` unique index, and a new day starts fresh because it has no row yet.
  The uniqueness constraint becomes `(tenant_id, business_date, order_number)` —
  `04-data-model.md` §6 — because a number that resets daily is not unique across
  days. `business_date` is stored, not derived, so the index is a plain btree.
- **The 201 body is frozen into `orders.placement_response`** in the placement
  transaction. A replay returns those exact bytes (F1.6 §5); re-deriving it could
  differ once the ETA queue moves.

## Consequences

Accept and void can use the stamped recipe identity without recomputing a
historical order. The additional open-order partial index keeps the no-show
gate bounded. The webhook's raw-buffer JSON parser is now scoped to its own
plugin so every other route gets a parsed body for its Zod schema. This
completes existing F1 scope; no milestone moves and nothing is displaced from
the explicit cut list.
