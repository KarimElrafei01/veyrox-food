# Bounded contexts

`apps/api` is organised by DDD bounded context (docs/14 §2). Each context that
carries invariants has four layers — `domain/` (pure), `application/` (use cases),
`infrastructure/` (Drizzle, adapters), `interface/` (thin HTTP). Contexts
communicate through events, never by importing each other's internals (lint
enforces this once the contexts exist).

Planned contexts, none implemented yet:

| Context     | Treatment                                           | First built           |
| ----------- | --------------------------------------------------- | --------------------- |
| `ordering`  | Full aggregate — accept gate, void, abandon         | S2–S3                 |
| `catalog`   | Plain services over repositories                    | S1                    |
| `inventory` | Full aggregate — the material ledger                | S4–S5                 |
| `loyalty`   | Full aggregate — points, tiers, clawback            | S2                    |
| `payments`  | Plain services — cash/visa, EOD rollup              | S3                    |
| `messaging` | `MessagingChannel`, inbound webhook, outbound queue | S0 (walking skeleton) |
| `identity`  | Four auth realms, staff, devices, PINs              | S2–S5                 |
| `platform`  | Tenants, entitlements, flags, settings registry     | S6–S7                 |
| `analytics` | Read models and SQL — no domain layer               | S6                    |

OpenAPI generation from the Zod contracts is wired when the first contracted
route lands (NFR-62); `/health` is schema-first but not part of the public contract.
