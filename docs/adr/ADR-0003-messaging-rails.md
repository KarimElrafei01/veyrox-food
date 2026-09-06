# ADR-0003 — Cloud API + webview for ordering; isolated whatsapp-web.js for the Habit Engine

**Status**: Accepted · **Date**: 2026-09-05
**Constrained by**: PRD §6.1 and §9 R1 — the split is a product decision already made and explicitly accepted. This ADR records the *engineering* choices inside it.

## Context

PRD §6.1 mandates two messaging rails: the official WhatsApp Business Platform for ordering and owner notifications, and whatsapp-web.js for the Habit Engine only. The second knowingly violates WhatsApp Terms of Service (R1, accepted). Two engineering questions remain open: what UI mechanism the ordering flow uses on the official rail, and how the unofficial rail is contained.

## Decision A — Ordering UI: CTA-URL button to a hosted webview

The bot sends a CTA-URL button opening `apps/order` in WhatsApp in-app browser, with an HMAC-signed 15-minute session token.

**WhatsApp Flows was evaluated and deferred to v2.** Flows is the better-feeling experience — native forms, no page load — and it can express dynamic menus through a data-exchange endpoint. The webview wins for v1 on three counts: full control over a stateful, modifier-heavy cart; one codebase for the whole journey rather than a Flows data-exchange endpoint (with its own encryption keys and versioning) *plus* a webview for anything Flows cannot express; and shared `packages/ui` and `packages/i18n`, which matters more than usual because RTL layout is a P0 (FR-9.1) and would otherwise be solved twice.

**This decision is now weaker than it was, and should be revisited.** It originally rested partly on the checkout step needing a browser regardless — and there is no checkout step any more (ADR-0010). With cash on pickup, the entire customer journey is menu → cart → confirm, which is well within what Flows can express. Revisit at the S8 pilot review, or sooner if in-app-browser friction shows up as a measurable conversion problem — a real risk (NFR-45), measured from Sprint 1.

## Decision B — Containment of the unofficial rail

Full design in `10-risk-containment.md`. The architectural commitments:

1. **Separate host, separate provider, separate egress IP.** Not just a separate number — network-level correlation is one of the known ban vectors, and a Chromium process running an unofficial library is the least trustworthy thing in the system.
2. **`habit_reader` database role with `SELECT` on one four-column view and no other grant anywhere.** The habit host holds no credential that can write anything, and no Meta credential at all.
3. **Outcomes flow back through one mTLS endpoint accepting outcome rows keyed by phone hash**, so the boundary never carries more personal data than it must.
4. **A `HabitChannel` interface with two complete implementations**, the official Cloud API one having its templates submitted to and approved by Meta *before* the unofficial rail ever goes live.
5. **`habit_rules.channel` carries a database CHECK constraint** locking habit sends to the unofficial rail, so PRD §8.7 cannot be violated by a code change.

Point 4 is the important one. Template approval takes days to weeks. Discovering that after a ban means retention is dead for a fortnight; having it approved in advance means a ban costs a flag flip and a per-message fee.

## Alternatives considered for the unofficial rail

**Run whatsapp-web.js on the same infrastructure as the API.** Rejected — this is precisely the cascade R1 warns about, extended to shared credentials and shared network identity.

**Skip the unofficial rail and use official Marketing templates from day one.** Rejected: outside this ADR's authority. The PRD made this trade-off explicitly and with its reasoning stated (§6.1). The engineering response is to make reversal cheap, which decision B point 4 does.

**Evade detection more aggressively** — proxy rotation, device fingerprint spoofing. Rejected deliberately. It escalates a terms violation into something of a different character, raises the consequences if noticed, and buys little; conservative send behaviour and a working opt-out do more to prevent bans, because bans follow user reports more reliably than traffic analysis.

## Consequences

**Good**: a ban costs one disposable VPS and a flag flip. The ordering channel is structurally incapable of being taken down with it.

**Bad**: two messaging code paths to maintain and test. An ongoing operational tax from whatsapp-web.js breaking against WhatsApp Web updates (NR-1) — treated as routine, with the same response as a ban. And a permanent, knowing terms violation, which is documented, disclosed to the café in writing, and owned rather than hidden.
