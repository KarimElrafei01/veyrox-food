# Veyrox Food — Code Structure & Conventions

Folder layout and the rules code is written to. **No code exists yet** — this is the shape Sprint 0 builds into.

---

## 1. Repository layout

```
veyrox-food/
├── apps/
│   ├── api/                 Backend. DDD, bounded contexts. The single write path
│   ├── worker/              BullMQ jobs. Same image as api, different entrypoint
│   ├── order/               Customer webview — public, token-gated, strictest perf budget
│   ├── kds/                 Barista kitchen display
│   ├── till/                Cashier counter
│   ├── console/             Store Console — owner analytics, costing, CRUD
│   └── admin/               Platform Admin — fleet ops, WebAuthn realm
│
├── packages/
│   ├── domain/              Shared kernel: money, pricing, ETA, loyalty tiers, feature resolver
│   ├── contracts/           Zod schemas → runtime validation + types + OpenAPI
│   ├── db/                  Drizzle schema + migrations
│   ├── ui/                  Design tokens, primitives, RTL-aware layout
│   ├── i18n/                Message catalogs (en default, ar-EG), formatting, RTL helpers
│   ├── ops-core/            Shared by kds + till: offline outbox, service worker,
│   │                        device enrollment, staff PIN, SSE client
│   ├── api-client/          Typed client generated from contracts
│   ├── observability/       OTel, logger, redaction
│   └── testkit/             Fixtures, factories, webhook replay corpus
│
├── infra/                   Dockerfiles, compose, Terraform for the habit host
└── docs/                    Spec of record
```

### Why `ops-core` exists

KDS and Till are separate apps per the folder requirement, but they run on the same tablets, in the same room, with the same auth and the same offline requirements. Everything device-shaped — outbox, service worker, device enrollment, PIN flow, SSE client, staleness banner — lives in `ops-core` and is imported by both.

**The known cost:** a café tablet doing both jobs installs two PWAs instead of one. Accepted deliberately; revisit if staff find it awkward in the pilot.

---

## 2. Backend — DDD, applied pragmatically

```
apps/api/src/
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

Each context has the same four layers:

```
contexts/ordering/
├── domain/          Pure. Order aggregate, state machine, policies. No I/O, no clock
├── application/     Use cases: PlaceOrder, AcceptOrder, VoidOrder, CollectOrder
├── infrastructure/  Drizzle repositories, adapters
└── interface/       HTTP routes. Thin: parse → call use case → map result
```

### Rules that make this DDD rather than folders-with-nice-names

1. **Contexts talk through events, never direct imports.** `ordering` emits `OrderAccepted`; `inventory` subscribes and writes ledger rows. A context may import another's *published events and public types* — never its repositories, aggregates, or internals.
2. **The domain layer is pure.** No Drizzle, no Fastify, no `Date.now()`, no `Math.random()`. Clock and IDs are injected. This is what makes it property-testable.
3. **Aggregates own invariants and transaction boundaries.** The `Order` aggregate is what guarantees materials deduct exactly once and a void negates exactly the rows it created. One aggregate per transaction wherever possible.
4. **The application layer orchestrates only**: load → call domain → persist → publish. No business rules here.
5. **The interface layer is thin.** Parse with Zod, call a use case, map to HTTP. If there is logic in a route handler, it is in the wrong place.

### Where DDD is deliberately NOT applied

This matters as much as where it is. **Rich domain modelling is for invariants, not for everything.**

| Context | Treatment | Why |
|---|---|---|
| `ordering`, `inventory`, `loyalty` | Full aggregates, domain events, invariants | Money and materials. Getting these wrong is silent and cumulative |
| `catalog`, `platform`, `identity` | **Plain services over repositories.** No aggregate roots, no factories | Menu items are CRUD with versioning. Wrapping them in an aggregate root adds ceremony and protects nothing |
| `analytics` | Read models and SQL. No domain layer at all | It is queries. There is no behaviour to model |

**A menu item does not need an aggregate root because a pattern book says so.** If you cannot name the invariant an aggregate protects, do not build one.

---

## 3. Frontends — feature-first

Every SPA has the same shape:

```
apps/kds/src/
├── features/
│   ├── board/               Columns, ticket rendering, drag/tap advance
│   ├── accept-gate/         New column, accept/reject
│   └── availability/        86-ing from the board
├── shared/                  App-local helpers only
├── app/                     Routing, providers, entry
└── main.tsx
```

**Feature-first, not layer-first.** Everything a feature needs — component, hook, local state, its slice of API calls — lives in its folder. No global `components/`, `hooks/`, `utils/` dumping grounds; those become where code goes to be forgotten.

Anything used by two features moves to the app's `shared/`. Anything used by two apps moves to a package. In that order, and only when the second use actually appears.

---

## 4. Code rules

### Simplicity — the governing rule

**Write the simplest thing that satisfies the requirement.** Cleverness is a cost paid by whoever reads it next, which is you in six months.

- **No abstraction without a second caller.** No interface with one implementation, no factory producing one type, no generic with one instantiation. Rule of three: duplicate twice, abstract on the third.
- **No repository interfaces "for testability."** Integration tests run against real Postgres (`07-test-and-quality-strategy.md`). A mock-shaped seam that exists only for a mock is dead weight.
- **No premature configurability.** Hard-code it until something needs it different.
- **Guard clauses over nesting.** Maximum depth 3. If you are deeper, extract.
- **Functions short enough to read without scrolling.**
- **Plain functions by default.** Classes only for aggregates with invariants.
- **No barrel files** re-exporting a whole folder. They hide dependency graphs and defeat tree-shaking.
- **No `any`** without an inline justification comment.

### Naming

Name things the way a café person would say them: `void`, `abandon`, `eightySix`, `ticket`, `accept`, `collect`. Not `OrderCancellationRequestProcessor`.

The domain language in `docs/` is the domain language in code. If a term appears in the FRs, it appears in the identifiers — that consistency is most of what makes a codebase navigable.

### Comments

**Comments explain WHY. Never WHAT.**

If a comment describes what the code does, the code needs a better name, not a comment. If it explains why a non-obvious decision was made, an invariant being protected, or a bug being avoided — it earns its place.

Comment these, always:

- Anything protecting an invariant — especially the ledger negation, which looks like it could be "simplified" into a recipe recomputation. Say why it must not be.
- Deliberate deviations from the obvious approach, with a link to the ADR.
- Workarounds for third-party behaviour, with a link to the issue.

Do not comment: obvious code, section headers inside functions, changelogs (git has those), or commented-out code (delete it).

### Types

- `strict` everywhere.
- Branded types for anything unit-bearing: `Minor`, `PhoneE164`, `TenantId`. Money must be impossible to add to a plain number.
- Parse at boundaries with Zod, then trust the type inside. No defensive re-validation in the middle of the call stack.
- Prefer discriminated unions over optional fields and boolean flags.

### Errors

- Domain errors are typed and named for the rule they broke: `ItemUnavailable`, `InvalidTransition`, `ManagerPinRequired`.
- The interface layer maps domain errors to RFC 9457 problem details with a stable `code`.
- Never throw strings. Never swallow an error silently — if it is genuinely ignorable, say so in a comment.

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

Imports ordered: node builtins → external → `@veyroxai/*` packages → app-relative. Enforced by lint, never argued about.

---

## 6. What the linter enforces

So none of the above depends on memory:

- No floats in money positions (branded `Minor`)
- No literal strings in rendered components (i18n)
- No `any` without justification
- Import order and no circular dependencies
- **No cross-context imports** in `apps/api` except published events and public types
- Max function length and nesting depth
- No barrel files
