# Veyrox Food — Code Structure & Conventions

Folder layout and the rules code is written to. The shape Sprint 0 builds into; `ADR-0019`
(layout) and `ADR-0018` (frontend layering) are the reasoning behind §1–§3.

---

## 1. Repository layout

The git root is the parent. It holds two things: the spec and the code.

```
veyrox-food/
├── docs/                       Spec of record
└── code/                       pnpm + Turborepo workspace · .env lives here
    ├── backend/
    │   ├── api/                Fastify. DDD bounded contexts. The single write/read path
    │   └── worker/             BullMQ jobs. Same image as api, different entrypoint
    │
    ├── frontends/
    │   ├── order/              Customer webview — public, token-gated, strictest perf budget
    │   ├── kds/                Barista kitchen display
    │   ├── till/               Cashier counter
    │   ├── console/            Store Console — owner analytics, costing, CRUD
    │   └── admin/              Platform Admin — fleet ops, WebAuthn realm
    │
    ├── packages/
    │   ├── domain/             Shared kernel: money, pricing, ETA, loyalty tiers, feature resolver
    │   ├── contracts/          Zod schemas → runtime validation + types + OpenAPI
    │   ├── db/                 Drizzle schema + migrations
    │   ├── ui/                 Design tokens, primitives, RTL-aware layout
    │   ├── i18n/               Message catalogs (en default, ar-EG), formatting, RTL helpers
    │   ├── ops-core/           Shared by kds + till: offline outbox, service worker,
    │   │                       device enrollment, staff PIN, SSE client
    │   ├── api-client/         Typed HTTP client (auth, base URL, problem-detail decoding)
    │   ├── observability/      OTel, logger, redaction
    │   └── testkit/            Fixtures, factories, webhook replay corpus
    │
    └── infra/                  Dockerfiles, compose, Terraform for the habit host
```

Every workspace member is exactly **two levels under `code/`** (`code/backend/api`,
`code/frontends/order`, `code/packages/ui`). That is deliberate: `../../` resolves to `code/`
from any of them, so `tsconfig` `extends`, the shared `eslint.config.js`, and
`--env-file ../../.env` need no change from the pre-`code/` layout.

### Why `ops-core` exists

KDS and Till are separate apps (ADR-0009 amendment), but they run on the same tablets, in the
same room, with the same auth and the same offline requirements. Everything device-shaped —
outbox, service worker, device enrollment, PIN flow, SSE client, staleness banner — lives in
`ops-core` and is imported by both.

**The known cost:** a café tablet doing both jobs installs two PWAs instead of one. Accepted
deliberately; revisit if staff find it awkward in the pilot.

---

## 2. Backend — DDD, one process, hard walls

```
code/backend/api/src/
├── contexts/
│   ├── ordering/            Order lifecycle, accept gate, void, abandon
│   ├── catalog/             Menu, modifiers, prices, recipes, availability
│   ├── inventory/           Material ledger — the invariant core
│   ├── loyalty/             Points, tiers, clawback
│   ├── payments/            Cash/visa recording, EOD rollup
│   ├── messaging/           MessagingChannel, inbound webhook, outbound queue
│   ├── identity/            Four auth realms, staff, devices, PINs
│   ├── platform/            Tenants, entitlements, flags, settings registry
│   └── analytics/           Read models, reports, digest
│
├── shared/
│   ├── http/                Fastify setup, error mapping, idempotency middleware
│   ├── db/                  Connection, transaction helper, SET LOCAL app.tenant_id
│   ├── events/              In-process domain event bus → SSE stream + job queue
│   ├── observability/
│   └── config/
└── main.ts
```

One Fastify process (ADR-0019). `worker` is the same image with a different entrypoint. Not
four services — the material-ledger invariant must not cross a network boundary.

### Every context has the same four layers

```
contexts/ordering/
├── domain/          Pure. Aggregate, state machine, policies, events. No I/O, no clock
├── application/     Use cases: place-order, accept-order, void-order, collect-order
├── infrastructure/  Drizzle repositories, adapters
└── interface/       HTTP routes. Thin: parse → call use case → map result
```

The four folders exist in **every** context — `ordering` and `catalog` and `analytics`
alike. `domain/index.ts` is always present: it is the context's public face, the only thing
another context may import (see rule 1). The other three layers get an `index.ts` once
something outside the layer imports more than one file from it — until then, direct file
imports within the app are fine. Where a layer has more than a handful of files they group by
use case (`application/place-order/…`).

**Uniform folders, not uniform ceremony.** The skeleton is the same everywhere so there is no
per-context judgement call about "is this one allowed a domain layer". What goes *inside*
still follows §4:

| Context | What its `domain/` actually holds |
|---|---|
| `ordering`, `inventory`, `loyalty` | Full aggregates, domain events, invariants. Money and materials — wrong here is silent and cumulative |
| `catalog`, `platform`, `identity` | Types, events, and pure helpers. Plain services over repositories in `application/`. An aggregate root appears only when you can name the invariant it protects |
| `analytics` | Read-model types and nothing else. `application/` is SQL-backed query handlers |

**A menu item does not get an aggregate root because a pattern book says so.** The folder
existing is not permission to fill it.

### Rules that make this DDD rather than folders-with-nice-names

1. **Contexts talk through events, never direct imports.** `ordering` emits `OrderAccepted`;
   `inventory` subscribes and writes ledger rows. A file in `contexts/A/**` may import
   `contexts/B/domain/index` — its published events and public types — and nothing else in
   `B`. This is a lint zone (§6), not a convention.
2. **The domain layer is pure.** No Drizzle, no Fastify, no `Date.now()`, no `Math.random()`.
   Clock and IDs are injected. This is what makes it property-testable.
3. **Aggregates own invariants and transaction boundaries.** The `Order` aggregate guarantees
   materials deduct exactly once and a void negates exactly the rows it created. One
   aggregate per transaction wherever possible.
4. **The application layer orchestrates only**: load → call domain → persist → publish. No
   business rules here.
5. **The interface layer is thin.** Parse with Zod, call a use case, map to HTTP. Logic in a
   route handler is in the wrong place.

---

## 3. Frontends — feature-first, six folders

Every SPA has the same shape:

```
code/frontends/order/src/
├── features/
│   ├── menu/
│   │   ├── ui/              Screen(s) — route-level composition
│   │   ├── components/      Presentational pieces only this feature uses
│   │   ├── hooks/           useMenu — React glue over a usecase
│   │   ├── usecases/        loadMenu — pure orchestration
│   │   ├── repo/            menuRepo — wire DTO ↔ feature model, retry/fallback policy
│   │   └── datasource/      one transport call each → @veyroxai/api-client + a contract schema
│   └── checkout/            …same six folders
├── shared/                  App-local helpers only (http client wiring, session, cart store)
├── app/                     Router, providers, entry
└── app/main.tsx
```

**Feature-first, not layer-first.** Everything a feature needs lives in its folder. No global
`components/`, `hooks/`, `utils/` dumping grounds.

**Six folders inside every feature** (ADR-0018), each testable on its own:

| Folder | Does | Never |
|---|---|---|
| `ui/` | The feature's screen(s). Props/context in, callbacks out. | fetch, rules, importing `repo`/`datasource` |
| `components/` | Presentational pieces this feature owns and no other imports. | fetch, orchestration, cross-feature imports |
| `hooks/` | React glue: call a usecase, hold `loading`/`error`/`data`. `useX`. | JSX, `fetch`, transport |
| `usecases/` | Pure orchestration: repo(s) + input → result. Merge, validate, decide. | React, DOM, `fetch` |
| `repo/` | Wire DTO ↔ the model the feature holds; retry/fallback policy. | React, UI, raw `fetch` |
| `datasource/` | One transport call: build request, call `api-client`, parse the contract schema, return DTO or throw `ApiError`. | translation, orchestration, React |

The six folders exist in every feature with no exemption — a feature with nothing to
translate has a one-line pass-through `repo`. That cost is navigation, paid once at scaffold
time; the payoff is one shape and a lint rule instead of a per-feature decision (ADR-0018).

A file in `features/A/**` may not import `features/B/**` — lint zone (§6). Shared code moves
to the app's `shared/` on the second use, to a package on the second app. In that order.

---

## 4. Code rules

### Simplicity — the governing rule

**Write the simplest thing that satisfies the requirement.** Cleverness is a cost paid by
whoever reads it next, which is you in six months.

The uniform layer skeletons in §2 and §3 are the one deliberate exception: the folders are
always there. Everything *inside* them follows these rules —

- **No abstraction without a second caller.** No interface with one implementation, no
  factory producing one type, no generic with one instantiation. Rule of three: duplicate
  twice, abstract on the third. An empty or pass-through layer file is not an abstraction —
  it is a placeholder, and it stays trivial until a second caller or a real invariant arrives.
- **No repository interfaces "for testability."** Integration tests run against real Postgres
  (`07-test-and-quality-strategy.md`). A mock-shaped seam that exists only for a mock is dead
  weight. `infrastructure/` holds concrete Drizzle repositories.
- **No premature configurability.** Hard-code it until something needs it different.
- **Guard clauses over nesting.** Maximum depth 3. If you are deeper, extract.
- **Functions short enough to read without scrolling.**
- **Plain functions by default.** Classes only for aggregates with invariants.
- **No barrel files** re-exporting a whole folder. A layer's `index.ts` names its public
  surface explicitly — that is not a barrel.
- **No `any`** without an inline justification comment.

### Naming

Name things the way a café person would say them: `void`, `abandon`, `eightySix`, `ticket`,
`accept`, `collect`. Not `OrderCancellationRequestProcessor`.

The domain language in `docs/` is the domain language in code. If a term appears in the FRs,
it appears in the identifiers — that consistency is most of what makes a codebase navigable.

### Comments

**Comments explain WHY. Never WHAT.**

If a comment describes what the code does, the code needs a better name, not a comment. If it
explains why a non-obvious decision was made, an invariant being protected, or a bug being
avoided — it earns its place.

Comment these, always:

- Anything protecting an invariant — especially the ledger negation, which looks like it
  could be "simplified" into a recipe recomputation. Say why it must not be.
- Deliberate deviations from the obvious approach, with a link to the ADR.
- Workarounds for third-party behaviour, with a link to the issue.

Do not comment: obvious code, section headers inside functions, changelogs (git has those),
or commented-out code (delete it).

### Types

- `strict` everywhere.
- Branded types for anything unit-bearing: `Minor`, `PhoneE164`, `TenantId`. Money must be
  impossible to add to a plain number.
- Parse at boundaries with Zod, then trust the type inside. No defensive re-validation in the
  middle of the call stack.
- Prefer discriminated unions over optional fields and boolean flags.

### Errors

- Domain errors are typed and named for the rule they broke: `ItemUnavailable`,
  `InvalidTransition`, `ManagerPinRequired`.
- The interface layer maps domain errors to RFC 9457 problem details with a stable `code`.
- Never throw strings. Never swallow an error silently — if it is genuinely ignorable, say so
  in a comment.

---

## 5. File and module conventions

| Thing | Convention |
|---|---|
| Files | `kebab-case.ts` |
| Types, classes, components | `PascalCase` |
| Functions, variables | `camelCase` |
| Constants | `SCREAMING_SNAKE` only for true compile-time constants |
| Tests | `*.test.ts` beside the source; integration in `__integration__/` |
| One primary export per file | Named after the file |
| Layer public surface | `<layer>/index.ts`, explicit named re-exports only |

Imports ordered: node builtins → external → `@veyroxai/*` packages → app-relative. Enforced
by lint, never argued about.

---

## 6. What the linter enforces

So none of the above depends on memory:

- No floats in money positions (branded `Minor`)
- No literal strings in rendered components (i18n)
- No `any` without justification
- Import order and no circular dependencies
- **No cross-context imports** in `code/backend/api` except `contexts/<other>/domain/index`
  (`import/no-restricted-paths` zone)
- **No cross-feature imports** in a frontend — `features/A/**` may not reach into
  `features/B/**` (`import/no-restricted-paths` zone)
- Max function length and nesting depth
- No barrel files
