# ADR-0005 — Server push over SSE with event replay; no polling

**Status**: Accepted · **Date**: 2026-09-06
**Supersedes**: ADR-0005 (Supabase Realtime, read-only, with a polling fallback), 2026-09-05.

## Context

PRD §8.3 requires KDS status changes to propagate in under one second, and the customer ETA depends on live queue depth. Clients are tablets on café wifi, which drops.

The original decision used Supabase Realtime — a service tailing Postgres' WAL and pushing changes to browsers — with a 3-second polling fallback when the socket dropped. That fell with Supabase (ADR-0002), and the polling fallback was independently rejected: it is a wasteful pattern that also leaves a window where the board is silently behind.

## Decision

**Server-Sent Events from our own API, with replay on reconnect. No polling loop anywhere.**

```
Tablet ──► GET /staff/stream            (SSE, connection stays open)
Server ──► pushes each order_event as it commits, each with an id
           ... wifi blips, connection drops ...
Browser ──► auto-reconnects, sends  Last-Event-ID: 4821
Server ──► replays 4822.. from order_events, then resumes live
```

Four implementation requirements, each of which is a real café failure if missed:

1. **Heartbeat comment every 20s.** Cloudflare and Fly both kill idle connections; without it the stream dies silently every minute or so.
2. **Gap cap.** If a tablet was off for an hour, do not replay 3,000 events. Past a threshold, send one full board snapshot and resume live. That is a resync, not a poll.
3. **`X-Accel-Buffering: no`** and flush per event, or the proxy buffers your events into uselessness.
4. **The staleness banner stays.** Push does not remove the need for staff to know the board is not live — that requirement was never about polling (FR-3.6).

## Why this works cleanly here

**`order_events` is already an append-only, sequenced event log.** It exists because every status transition must be auditable (P2, `01-system-design.md` §4.3). Replay is therefore `WHERE id > :lastSeen` against a table we were building anyway — no new infrastructure, no separate event store, no outbox table.

That is the whole argument. The design that made the system auditable also made it streamable.

## Why SSE rather than WebSocket

We only need server→client; the tablet's writes go through the normal API. On that shape SSE wins on the things that matter for reliability:

- The browser's `EventSource` gives **automatic reconnect and `Last-Event-ID`** for free. With WebSocket we would hand-roll both, and the resume-after-gap logic is exactly where such code is wrong.
- It is plain HTTP — no upgrade handshake to get through proxies, no separate server.

WebSocket's bidirectionality buys nothing here and costs the two mechanisms above.

## What this replaces, and what it costs

Compared to the vendor Realtime it replaces, the thing genuinely lost is: **you can no longer forget to publish.** Supabase pushed off the WAL, so a new write path that omitted a `notify()` call could not silently break the board.

That risk is much smaller here because of T1 — every mutation goes through one API, and every status transition already writes `order_events`. Publishing happens in the same place, from the same commit hook. It is one code path, not many. A test asserts that every state transition produces a stream event.

Compared to the polling fallback it replaces, this is strictly better: no 3-second gap, no wasted requests, and no window where the board is behind without knowing it.

## Alternatives considered

**Polling at 2–3 seconds.** Simple and, at 3–5 clients per café, cheap. Rejected: it misses the sub-second requirement, makes the ETA's queue-depth input stale by design, and the user explicitly ruled it out. Retained only as the *shape* of the gap-cap resync, which is a single fetch rather than a loop.

**Postgres `LISTEN/NOTIFY` as the trigger.** Attractive — it would restore the "cannot forget to publish" property. Rejected for now because it adds a dedicated long-lived connection per API instance and Neon's connection pooling makes `LISTEN` awkward. Worth revisiting if we ever run enough API instances that in-process fan-out becomes insufficient.

**A managed realtime vendor** (Ably, Pusher). Rejected: a paid dependency for something that is roughly 150 lines against a table we already maintain.

## Consequences

**Good**: sub-second propagation, no polling, no vendor, no message bus, replay-on-reconnect that closes the gap café wifi creates, and it reuses the audit log rather than adding infrastructure.

**Bad**: we own reconnection correctness, heartbeats, and proxy behaviour — all of which are easy to get subtly wrong and are therefore covered by an explicit integration test (drop the connection mid-stream, assert no missed and no duplicated events). Long-lived connections also mean the API can no longer scale to zero, which is a real constraint on the near-zero hosting phase (ADR-0011).

## Amendment, 2026-09-12 — heartbeat is a named event, not a bare comment

Requirement 1 said "heartbeat **comment**" and requirement 4 said "the staleness banner stays" (FR-3.6) as if the same mechanism served both. It cannot: an SSE comment line (`: heartbeat\n\n`) is invisible to the browser's `EventSource` API by spec — `onmessage` and every `addEventListener` never fire for it. A client literally cannot use it to reset a staleness watchdog, which is the one thing requirement 4 needs it for. This surfaced only once F2's actual KDS frontend tried to consume it (`packages/ops-core`'s SSE client) — nothing before this needed the heartbeat to be observable, so nothing caught it.

**Fix**: `SseHub`'s heartbeat now sends a named `event: heartbeat` frame (`data: {}`) on the same 20s interval, via the same `formatSseEvent` every real event already uses, instead of the bare comment string. This still resets Cloudflare/Fly's idle-connection timers (requirement 1's actual purpose — any bytes on the wire do that, comment or not) and is now something `EventSource.addEventListener('heartbeat', …)` can see, which is what the frontend staleness watchdog (FR-3.6, 10s threshold) is built against. No `id:` line — it carries no `order_events` row and must never be replayed.

The wire-format detail changes; the requirement itself (heartbeat every 20s, for the reasons already stated) does not.
