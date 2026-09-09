# ADR-0018 — Frontend: design system and feature layering

**Status**: Accepted · **Date**: 2026-09-09
**Supersedes** ADR-0018 (*Customer webview: design system and feature layering*, 2026-09-06),
whose four-layer feature folder is replaced by the six-folder layout below. The design-system
and response-contract decisions from that record are unchanged and restated here.

## Context

`apps/order` was the first SPA and set the pattern the other four inherit. The 2026-09-06
record fixed three things: the design system lives in `packages/ui` as CSS custom properties
(no Tailwind), a feature folder has internal layers, and response contracts sit in
`packages/contracts` next to the requests.

The layer split it chose was four folders — `ui / hooks / usecases / repo`. Two gaps showed
up as `apps/order` filled in, and the same gaps will hit `till`, `console`, and `admin`:

1. **`repo/` was doing two jobs.** "Build the request, call the client, parse the Zod
   response, map the DTO to something the feature wants to hold" is a transport concern and a
   translation concern in one file. When the wire shape and the screen's model diverge — and
   for `console` analytics they will — that file stops being testable as either one.
2. **Feature-local presentational pieces had nowhere to live.** `ui/` held both the screen
   and its sub-components with no separation, so "the screen" and "the button this screen
   happens to need" read as peers.

The owner also asked, this session, for **one layering shape across every feature in every
SPA**, enforced by lint rather than remembered — accepting more folders on trivial features
as the price of never having to decide per feature.

## Decision

**1 — Design system in `packages/ui`, tokens as CSS custom properties, CSS Modules, no
Tailwind.** Unchanged from 2026-09-06. `packages/ui/src/tokens/*.css` defines the Brew &
Baladi semantic tokens on `:root` with `@media (prefers-color-scheme: dark)` and
`:root[data-theme="…"]` overrides. Primitives use logical properties so RTL is a consequence
of `dir`. Icons are an inline-SVG set. Fonts are self-hosted (`@fontsource`).

**2 — Six folders per feature**, in every SPA, for every feature — no exemptions:

| Folder | Does | Never |
|---|---|---|
| `ui/` | The feature's screen(s). Route-level composition. Props/context in, callbacks out. | fetch, business rules, importing `repo`/`datasource` |
| `components/` | Presentational pieces this feature owns and no other feature imports. | fetch, orchestration, cross-feature imports |
| `hooks/` | React glue: call a usecase, hold `loading`/`error`/`data`, expose to `ui`. `useX`. | JSX, direct `fetch`, transport |
| `usecases/` | Pure orchestration: repo(s) + input → result. Merge, validate, decide navigation intent. | React, DOM, `fetch` |
| `repo/` | Feature-model boundary: call `datasource`, translate wire DTO ↔ the model the feature holds, own retry/fallback policy. | React, UI, raw `fetch`, `import.meta` |
| `datasource/` | One transport call each: build the request, invoke `@veyroxai/api-client`, parse the Zod response from `packages/contracts`, return the DTO or throw `ApiError`. | translation, orchestration, React |

A feature with no translation to do has a `repo/` that passes the DTO straight through — one
line. That is accepted; see Consequences. Cross-feature imports are forbidden by lint
(`import/no-restricted-paths`): shared code goes to the app's `shared/` on the second use, to
a package on the second app.

**3 — Response contracts live in `packages/contracts`**, alongside the request schemas.
Unchanged from 2026-09-06. One package is the source of truth for the HTTP boundary and the
OpenAPI document (NFR-62).

## Alternatives considered

**Keep the four layers, split `repo` only when translation appears.** This is the
simplicity-rule answer and it is what the superseded ADR implied. Rejected here because the
owner's explicit ask is a single shape enforced by lint — "split it when you need to" is a
per-feature judgement call, which is the thing being removed. The cost (a pass-through
`repo`) is one line and one file, and it is always in the same place.

**Fold `datasource` into `api-client`.** Rejected — `@veyroxai/api-client` is the generic
typed HTTP client (auth, base URL, problem-detail decoding). The per-endpoint call, with its
specific contract schema, is feature knowledge and belongs in the feature.

**`components/` as an app-level folder.** Rejected — that is the global `components/` dumping
ground `docs/14` §3 already bans. A component two features need is promoted to `shared/`.

Design-system alternatives (Tailwind, icon font, local response types) were considered and
rejected in the 2026-09-06 record; that reasoning stands and is not repeated.

## Consequences

**Good**: one folder shape for every feature in every SPA — no per-feature decision, and a
lint rule catches a misplaced file. `repo` and `datasource` are each testable as one thing
(translation with a fake datasource; transport with a fake HTTP client). `components/` keeps
a feature's screen legible by separating it from its parts. RTL stays nearly free; the design
system stays theme-swappable.

**Bad**: up to six folders on a feature that needs two — `apps/order`'s `loyalty` (one
celebration screen) carries `hooks/ usecases/ repo/ datasource/` as near-empty or
pass-through files. This is deliberate: the cost is navigation, not logic, and it is paid
once at scaffold time. If a feature's `repo` and `datasource` are still pure pass-throughs
after the feature is real, that is a signal the contract and the model genuinely match — not
a licence to merge them, because the next contract change would then reintroduce the split.

## Reversal

The layer split is a folder convention and a lint zone, not a framework. Collapsing
`datasource` back into `repo` for the whole codebase is a mechanical move plus deleting one
`import/no-restricted-paths` entry. The design tokens are plain CSS variables; swapping
styling systems is a primitive-by-primitive rewrite behind stable component APIs.
