# ADR-0022 — LAN peer relay for Till→KDS order visibility during a shared internet outage

**Status**: Accepted · **Date**: 2026-09-12
**Amends**: ADR-0006 (offline outbox) — does not replace it. ADR-0006 still governs how every
device eventually reaches the API; this ADR governs what happens *before* that, while it can't.

## Context

ADR-0006 makes Till and KDS offline-first against the cloud API: actions queue in an IndexedDB
outbox and flush once the device's own connection returns. That is sufficient for a *transient*
network blip on one device. It is not sufficient for the case the café actually cares about most:
**the whole café's internet drops**, a Till order is created during that window, and the barista
needs to see it on the KDS *now* — not whenever someone's connection happens to come back, which
during a real outage could be minutes to hours.

Two non-negotiables (`CLAUDE.md`) sit directly in the way of the obvious "just let them talk":

- **Single write path.** No client ever connects to Postgres; every mutation goes through the API.
- **Server-assigned order numbers.** `order_number` is a per-tenant-per-day sequence
  (`order_number_counters`, an upsert `04-data-model.md` §6), not something a client can compute.

Neither of those can be relaxed by this ADR — they protect real invariants (RLS as the only
enforcement boundary; the "shouted number" staying collision-free per day). What this ADR adds is
a mechanism that sits **entirely below** both: a same-room, best-effort echo that lets two already
-trusted devices tell each other "here is an order intent I've queued," while leaving the eventual
authoritative write — and the real order number — exactly where it already lives, at the API.

## Decision

**Till and KDS devices on the same café LAN relay order-lifecycle intents to each other directly,
over a channel that requires no internet, using the trust already established by device
enrollment.** The cloud API remains the only system of record; the LAN channel never writes
anything durable on its own — it only lets a peer *learn about* an intent sooner than the next
successful cloud sync would allow.

### 1. Trust: reuse device enrollment, don't invent a second credential

Every enrolled device already holds a long-lived `device_jwt` (90-day, weekly re-attested,
`09-security-privacy-compliance.md` §"Staff") scoped to one `tenant_id`. At enrollment (while
online), a device also caches the platform's JWT signing public key (JWKS). This is what makes
offline mutual authentication possible at all: **two devices on the same LAN can verify each
other's `device_jwt` signature and `tenant_id` claim without reaching the API**, because JWT
verification is a local, stateless operation once you hold the public key. No new pairing code, no
new secret, no QR-code dance — a Till and a KDS that were each separately enrolled against the
same tenant already trust each other the moment they're on the same network.

### 2. Discovery and transport

- **Discovery**: mDNS/Bonjour (`_veyrox-ops._tcp.local`), advertised by every enrolled device on
  `packages/ops-core` startup, carrying `tenantId` and `deviceKind` (`kds`/`till`/`both`) in the
  TXT record. A device only connects to peers advertising its own `tenantId` — this is a discovery
  filter, not the security boundary; the security boundary is the JWT handshake in step 1.
- **Transport**: a local WebSocket server each device runs on its own LAN address
  (`ops-core`, same package that owns the SSE client and outbox — this is the same shape of
  problem, a persistent connection with reconnect logic, just pointed at a peer instead of the
  API). Payloads are the same `packages/contracts` Zod schemas already used for the real API, so a
  relayed order intent and a synced one are structurally the same shape end to end — one schema,
  two transports.
- **No local server component.** Every device is simultaneously capable of being relay sender and
  receiver; there is nothing new to deploy, monitor, or become a single point of failure. This is
  the "direct LAN peer-to-peer" choice over "a local hub device" — a hub is a new box that can
  itself be the thing that's broken, in a room full of heat, grease, and one power strip already
  overloaded by kitchen equipment. Peer-to-peer degrades gracefully: any subset of devices that can
  see each other still works; there's no single node whose failure blacks out everyone.

### 3. What gets relayed, and what doesn't

**In scope**: Till → KDS, new-order-created intents only (`send-to-kitchen`-equivalent), for the
duration both devices are unable to reach the cloud API. This is the concrete case in the request
this ADR exists to satisfy — a barista must see a Till order appear on the kitchen board during an
outage.

**Explicitly out of scope for this ADR** (naming the boundary so it isn't silently assumed later):

- KDS does **not** relay its own accept/advance/tick actions back to Till over LAN. Till has no
  screen that shows KDS ticket state in this design (that's Till's own feature surface, not
  covered by the F2 KDS documents this ADR supports); if a future Till feature needs live KDS state
  during an outage, it can reuse this same channel, but that is a decision for that feature to make,
  not one this ADR pre-empts.
- KDS-to-KDS relay (multiple kitchen tablets) is not addressed — `backend-implementation.md`'s
  concurrency scope already defers multi-station concurrency; this ADR doesn't reopen that.
- The LAN channel carries **no payment data**. ADR-0006's asymmetry — "offline convenience does
  not extend to money" — holds exactly as before; a relayed order intent is display-and-prep
  information only, never a payment record.

### 4. Provisional identity — how a relayed order avoids getting a fake number

A Till, fully offline, cannot know the real `order_number` (server sequence) and must not
fabricate one that might collide with what the server eventually assigns. Instead:

- Till generates a **client-side UUIDv7** the moment the order is queued — this is exactly the
  `idempotencyKey` ADR-0006 already requires for every offline-queued action, reused here as the
  **correlation key**, not a second identifier invented for this ADR.
- The ticket displays a provisional label derived from it, e.g. `OFFLINE-3` (a small per-device
  offline-session counter for human readability — "3rd order this device queued while offline" —
  purely cosmetic, never sent anywhere as if it were a real order number).
- This same `idempotencyKey` travels three places: the Till's own outbox entry, the LAN-relayed
  message to KDS, and — once connectivity returns — the actual `POST /orders` /
  `POST /orders/:id/send-to-kitchen` request body. The server's response carries the **real**
  `orderNumber` against that same key.
- **Reconciliation**: when KDS learns of the real, synced order (via its own SSE stream or board
  resync, `05-api-and-integration-contracts.md` §3 / F2 `backend-implementation.md` §1, §3), it
  matches on `idempotencyKey` against any provisional ticket it's holding from the LAN relay and
  **replaces the provisional card in place** — same position in the column, label swaps from
  `OFFLINE-3` to `A-052`, nothing re-renders as a new card, nothing duplicates. This in-place swap
  is the one UI behavior this ADR requires of the KDS board; see `frontend-implementation.md`'s
  updated §3 for the visual spec.

### 5. The hard case: KDS itself acted on a provisional ticket before it synced

This is the real risk in this design, named explicitly rather than glossed over. Per the KDS's own
"100% operative offline" requirement, a barista can **Accept, advance, and tick items on a
provisional (LAN-relayed, not-yet-cloud-confirmed) ticket** while the KDS itself is also offline.
Those actions get queued in the **KDS's own outbox** — but they can't be keyed by a real
`order_id`, because one doesn't exist yet from the KDS's point of view. They are keyed by the same
`idempotencyKey` correlation value instead.

Resolution order on reconnect, enforced in `ops-core`'s sync loop:

1. The KDS's outbox entries referencing a provisional `idempotencyKey` are held (not sent) until
   that key resolves to a real `order_id` — either because the Till's own flush already happened
   (most likely — Till and KDS typically regain internet within moments of each other, since it's
   the same café uplink) or because the KDS's own board resync reveals the order already exists.
2. Once resolved, each queued KDS mutation (accept, advance, item-tick) is **replayed in original
   order** against the real `order_id`, each still carrying its own original `idempotencyKey` for
   that specific action — so a barista who accepted-then-bumped a provisional ticket produces the
   exact same two `order_events` rows, in the same order, that would have been produced had the KDS
   never lost connectivity at all.
3. If the Till's own order-creation flush is what's delayed (KDS reconnects first), the KDS simply
   waits — its queued mutations for that `idempotencyKey` stay pending, clearly marked in the UI as
   "waiting to sync" rather than silently retried in a hot loop. There is no path where KDS invents
   an order server-side on Till's behalf; only Till's own outbox ever calls `POST /orders`.

This is the same class of problem ADR-0006 already names as its hardest case ("a partial flush
interrupted by a second disconnection... is exactly what café wifi does") — this ADR doesn't solve
a new kind of problem, it extends that exact mechanism one hop earlier, to before the order even
has a server identity.

### 6. Bursts and ingestion ordering (rush hour, or a backlog flushing after an outage)

No new visible queue UI (per product decision — the board's existing 4-column New/Received/
Preparing/Ready design already is the queue). What's added is **strictly an ingestion-ordering and
dedup guarantee**, enforced server-side and in `ops-core`'s sync loop, not a UI concept:

- Every mutation, relayed or direct, still carries its `Idempotency-Key`. A burst of N queued
  actions flushing at once is N ordinary idempotent requests, not a special bulk path — the
  existing unique-constraint mechanism (`backend-implementation.md` §2.2) is what makes concurrent
  or out-of-order arrival safe, and that reasoning does not change because the burst is larger.
- Outbox flush order is **FIFO per device**, oldest `idempotencyKey` first — this matters because
  an `accept` queued before an `advance` on the same order must not replay out of order and hit
  the `advance`'s status-precondition guard as `INVALID_TRANSITION` against a status that
  hasn't been set yet. `ops-core`'s outbox already needs ordered flush for this reason independent
  of this ADR; this ADR just adds LAN-sourced entries to the same ordered queue, not a second one.
- Server-side, `order_events.id` is a single monotonically increasing sequence per the existing
  append-only design (ADR-0005) — this is what SSE replay already keys on, and it is what gives
  every connected client, KDS included, one canonical order for a burst of near-simultaneous
  events regardless of which device produced them or in what order they physically arrived at the
  API.

## Alternatives considered

**A local hub/relay device.** Rejected (§2) — a new deployable, a new single point of failure, in
the physical environment least hospitable to an unattended extra box (heat, grease, one shared
power strip). Peer-to-peer degrades per-connection instead of all-at-once.

**No LAN channel; accept the gap.** Rejected outright — it's the status quo ADR-0006 already
provides, and it does not satisfy the actual requirement (a Till order must be visible to the
kitchen during a shared outage, not just eventually).

**Pre-leased order-number batches.** Considered for §4, rejected in favor of the provisional-label
approach: leasing only helps if Till was online recently enough to have a lease in hand, adds
server-side lease/reclaim bookkeeping, and still needs a provisional-display fallback for the case
where no lease exists (e.g., a Till enrolled for the first time during an outage) — so it doesn't
remove the provisional-label mechanism, it only sometimes avoids showing it. Not worth the added
surface for a label that already updates in place within moments of reconnection in the common
case.

## Consequences

**Good**: satisfies the actual café failure mode this was written for — a Till order is visible to
the kitchen the moment it's created, even with the building's internet down, using zero new
infrastructure and zero new credentials. The correlation mechanism (`idempotencyKey` as the shared
key across LAN, outbox, and eventual API call) is one concept reused three times, not three
mechanisms.

**Bad**: this is genuinely the most complex reconciliation path in the KDS/Till surface — a
provisional ticket that itself accrues local KDS state before ever having a real `order_id` is a
new class of bug surface (§5), and it needs its own dedicated integration test (two devices, both
offline, KDS acts on a Till-relayed provisional ticket, both reconnect in either order) before this
ships. `ops-core` also grows a second connection type (LAN peer, alongside the existing SSE-to-API
connection) with its own discovery and reconnect logic — more to operate, monitor, and explain to
a new engineer, which is why this document states its boundaries (§3) as explicitly as it does
rather than leaving "how far does the LAN channel reach" as tribal knowledge.
