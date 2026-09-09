# Bounded contexts

`code/backend/api` is organised by DDD bounded context (`docs/14` §2, ADR-0019).

**Every context carries the same four layer folders** — `domain/` (pure),
`application/` (use cases), `infrastructure/` (Drizzle, adapters), `interface/`
(thin HTTP). `domain/index.ts` is always present and is the context's **only**
public face: another context imports from `contexts/<other>/domain/index` and
nothing else. Lint enforces this (`import/no-restricted-paths`). Empty layers
hold a `.gitkeep` until they have a file.

**Uniform folders, not uniform ceremony.** The skeleton is identical everywhere;
what fills it is not. An aggregate root appears only where you can name the
invariant it protects.

| Context     | Treatment                                               | Invariant it guards / why not                                                     | Built           |
| ----------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------- |
| `ordering`  | Full aggregate — accept gate, void, abandon             | Send→pending→received; deduct exactly once                                        | S1–S3 (partial) |
| `catalog`   | Plain services over repositories                        | Immutable published menu lives in `menu_versions`, not a domain object (ADR-0017) | S1 (partial)    |
| `inventory` | Full aggregate — the material ledger                    | Append-only `material_ledger`; void negates exact rows, never recomputes (INV-7)  | S4–S5           |
| `loyalty`   | Full aggregate — points, tiers, clawback                | Accrue once per paid order; clawback negates the exact accrual                    | S2 (partial)    |
| `payments`  | Plain services — cash/visa, EOD rollup                  | No PSP; paid only on attributed staff record                                      | S3              |
| `messaging` | `MessagingChannel`, inbound webhook, outbound queue     | Webhook verifies raw bytes, dedupes at edge, acks <500ms                          | S0 (partial)    |
| `identity`  | Plain services — four realms, staff, devices, PINs      | Manager PIN for voids; admin WebAuthn, no password fallback                       | S2–S5           |
| `platform`  | Plain services — tenants, entitlements, flags, settings | A key absent from `setting_definitions` cannot be set (ADR-0015)                  | S6–S7           |
| `analytics` | Read models and SQL — no behaviour to model             | Reports read snapshotted facts; yesterday never changes (NFR-19)                  | S6              |

OpenAPI generation from the Zod contracts is wired when the first contracted
route lands (NFR-62); `/health` is schema-first but not part of the public contract.
