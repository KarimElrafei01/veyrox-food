# ADR-0023 — Minimal staff device+PIN session verification ahead of the full S2–S5 auth realm

**Status**: Accepted · **Date**: 2026-09-12

## Context

Every staff endpoint the F2 Kitchen Display System needs (`accept`, `reject`, `advance`, `revert`,
item-tick, `GET /staff/board`, `GET /staff/stream`, `PUT /staff/kitchen-state/stations`) is
specified in `05-api-and-integration-contracts.md` §1 as requiring the staff auth realm:
`Bearer <device_jwt>` + `X-Staff-PIN-Token`.

That realm does not exist in code. `identity/domain/index.ts` implements only the customer-session
realm today, with its own comment stating the other three realms (staff device+PIN, owner
password+TOTP, platform WebAuthn) "land here as they are built (S2–S5)" — later sprints, not part
of the KDS feature this ADR supports.

It is also under-specified in the docs. ADR-0022 §1 cites `09-security-privacy-compliance.md
§"Staff"` for the device JWT's shape (90-day expiry, weekly re-attestation) and the PIN mechanism,
but that section contains only one line (`staff.pin_hash — argon2id + pepper`) — no JWT claim
shape, no signing-key management, no PIN-action-token TTL, no enrollment flow. Building the full
realm correctly means making several material decisions (enrollment UX, PIN storage and reset,
key rotation, the 90-day-plus-weekly-re-attestation renewal mechanic) that are not this feature's
to make on the side, and are large enough to displace real KDS schedule if bundled in here
(CLAUDE.md working rule 5).

Blocking every KDS endpoint on that full realm was rejected as the wrong trade for this pass.

## Decision

Build a **minimal, real, verification-only** slice of the staff realm now — not a mock, not a
bypassed check, but a working HMAC-signed token pair that every KDS controller actually verifies —
and defer everything about *issuing* those tokens (enrollment, PIN storage/hashing, key rotation,
the renewal mechanic) to S2–S5.

### 1. Two tokens, two independent verifications

Following the exact pattern already proven in `identity/domain/session-token.ts` for the customer
realm (HMAC-SHA256, versioned dot-delimited format, `timingSafeEqual` comparison, a rotation-key
array so a key can retire without invalidating every live token):

- **Device JWT** — `veyrox.device.v1.<payload>.<sig>`. Claims: `tenantId`, `deviceId`, `deviceKind`
  (`kds | till | both`), `issuedAt`, `expiresAt`. Long-lived (the 90-day figure is S2–S5's to set
  when it builds the actual enrollment/re-attestation endpoint; this ADR's `mint`/`verify` pair
  takes `issuedAt`/`expiresAt` as plain inputs and enforces nothing about *how* those get chosen).
- **PIN action token** — `veyrox.pin.v1.<payload>.<sig>`. Claims: `tenantId`, `deviceId`, `staffId`,
  `issuedAt`, `expiresAt`. Short-lived, proves a barista entered their PIN recently on *this*
  device. `POST /staff/pin/verify` (the endpoint that would hash-check a PIN and mint this token)
  is explicitly out of scope here — S2–S5 owns PIN storage (`staff.pin_hash`, argon2id + pepper,
  per `09-security-privacy-compliance.md`).

Separate signing keys per token type (never the customer session's keys) — a leaked key for one
realm must not mint a token for another, which is the concrete meaning of CLAUDE.md's "realms
never overlap."

### 2. `verifyStaffSession` — the one function every KDS controller calls

```ts
function verifyStaffSession(
  deviceJwtToken: string,
  pinActionToken: string,
  deviceKeys: readonly [string, ...string[]],
  pinKeys: readonly [string, ...string[]],
  nowEpochSeconds: number,
): { tenantId: string; deviceId: string; deviceKind: DeviceKind; staffId: string }
```

Verifies both tokens independently, then asserts `tenantId` and `deviceId` agree between them (a
PIN action token minted on one device must not authorize a request presenting a different device's
JWT). Throws the same `SessionInvalid`/`SessionExpired`-shaped errors the customer realm already
uses, so controllers can pattern-match the failure the same way `order-status-controller.ts`
already does.

### 3. Dependency injection, not a global

Every KDS controller takes `verifyStaffSession` (or the narrower `deviceKeys`/`pinKeys` it needs)
as an **injected dependency**, exactly how `orderStatusController` already takes `keys` for the
customer realm. This is what makes the swap-in of the real S2–S5 realm a change to *how tokens get
minted* (a new enrollment endpoint, real PIN storage, a renewal job) with **zero changes to any KDS
mutation's controller code** — the verification contract this ADR defines is the seam.

## Explicitly out of scope (left to S2–S5)

- `POST /staff/devices/enroll` and the owner-issued-code pairing flow.
- `POST /staff/pin/verify`, PIN hashing/storage/reset (`staff.pin_hash`, argon2id + pepper).
- Signing-key management and rotation ceremony.
- The 90-day expiry + weekly re-attestation renewal mechanic ADR-0022 references.
- Any UI for device enrollment or PIN entry.

Nothing above is designed or precluded by this ADR — it only defines the verification contract the
KDS depends on, so S2–S5 has a concrete target to build issuance against rather than needing to
also touch every KDS controller when it lands.

## Alternatives considered

**Build the full S2–S5 realm first.** Rejected — real, substantial scope (enrollment UX, PIN
lifecycle, key rotation) that isn't the KDS feature's to design under this task, and would displace
KDS schedule for work that has its own milestone.

**Stub auth entirely (no verification) to unblock KDS logic.** Rejected — every KDS controller
would need rework the moment real auth lands, and it's no harder to write a real, minimal verifier
than a fake one once the customer-session pattern already exists to copy.

**Reuse the customer session token format for staff too.** Rejected — collapses two realms that
CLAUDE.md explicitly requires to never overlap; a leaked customer signing key must not be able to
mint a staff device token.

## Consequences

**Good**: KDS endpoints get real, tenant-scoped, cryptographically verified auth today, with a
single, narrow, already-tested seam (`verifyStaffSession`) that S2–S5 slots real issuance behind
without touching KDS mutation code.

**Bad**: there is no working enrollment or PIN-entry flow yet, so a KDS controller cannot be
exercised end-to-end via real HTTP without a test helper that mints tokens directly (exactly how
`session-token.test.ts` already mints customer tokens directly rather than going through a login
flow) — acceptable for this pass, since integration tests already need that shape of helper
regardless of which realm issues the token.
