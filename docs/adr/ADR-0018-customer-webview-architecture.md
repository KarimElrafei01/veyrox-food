# ADR-0018 — Customer webview: design system and feature layering

**Status**: Accepted · **Date**: 2026-09-06

## Context

`apps/order` is the first SPA built (F1 — customer ordering, `docs/features/F1-customer-ordering/`).
It sets patterns the other four SPAs inherit, so three choices are worth recording before the code:

1. **How the design system is expressed.** A Google Stitch export (`brew_baladi/DESIGN.md`) gives a
   complete warm-espresso token set — colours, a Plus Jakarta Sans / Inter / Cairo type scale,
   8pt spacing, 8–16px radii, espresso-tinted low elevation. Stitch emits Tailwind; the repo does not
   use Tailwind.
2. **How a feature folder is structured.** `docs/14` §3 says "feature-first" but does not name the
   internal layers, and F1 has real orchestration (merge menu+availability, idempotent placement,
   error-code mapping) that does not belong in a component or a `fetch` call.
3. **Where the customer response contracts live.** The request half already sits in
   `packages/contracts` (ADR-0001, NFR-62); the response half was undecided.

## Decision

**1 — Design system in `packages/ui`, tokens as CSS custom properties, CSS Modules, no Tailwind.**
`packages/ui/src/tokens/*.css` defines the Brew & Baladi semantic tokens on `:root`, with
`@media (prefers-color-scheme: dark)` and `:root[data-theme="…"]` overrides. Primitives are styled
with CSS Modules using **logical properties** (`margin-inline-start`, `inset-inline-*`), so RTL is a
consequence of `dir` rather than a second stylesheet. Icons are an inline-SVG set, not an icon font.
Fonts are self-hosted (`@fontsource`), because the webview runs inside the WhatsApp in-app browser on
thin data and a blocked font request would leave text unstyled.

**2 — Four layers per feature folder**, each independently testable:

| Layer | Does | Never |
|---|---|---|
| `ui/` | Presentational screens + components. Props in, callbacks out. | fetch, business rules, repo/usecase imports |
| `hooks/` | React glue: call a usecase, hold `loading`/`error`/`data`, expose to the screen. `useX`. | JSX, direct `fetch` |
| `usecases/` | Pure orchestration: repo(s) + input → result. Merges, validates, decides navigation intent. | React, DOM, `fetch` |
| `repo/` | One backend call each: build the request, parse the response with a Zod schema from `packages/contracts`, return typed data or throw `ApiError`. | React, UI, orchestration |

**3 — Response contracts live in `packages/contracts`**, alongside the request schemas, so one
package is the single source of truth for the HTTP boundary and the OpenAPI document (NFR-62).

## Alternatives considered

**Tailwind, to port the Stitch output 1:1.** Rejected. It adds a build step and utility-class weight
to the app with the strictest budget (≤150 KB gz, NFR-9/10), and the token set is small enough that
CSS custom properties + CSS Modules express it directly. The Stitch HTML stays a visual reference,
not a source artefact.

**Three layers (screen / hook / repo), folding orchestration into the hook.** Rejected. F1's
placement logic — idempotency key generation, `expectedTotalMinor` handling, mapping
`PRICE_CHANGED` / `OPEN_ORDER_LIMIT` / `ITEM_UNAVAILABLE` to UI intent — is real branching that
deserves a plain function tested without a React renderer. The hook then only wires state.

**Icon font (Material Symbols, as Stitch uses).** Rejected for the same reason fonts are self-hosted:
a blocked or slow request in the in-app browser shows tofu boxes where the UI's affordances should be.

**Response types local to `apps/order`.** Rejected — it splits the HTTP contract across two places and
the backend cannot generate its serializers from the same schemas.

## Consequences

**Good**: RTL is nearly free; the design system is theme-swappable (a second Stitch palette,
"Fidelity Modern", drops in as another `[data-theme]` block); the four layers make the app testable
without a running backend (usecases with fake repos, hooks with a fake HTTP client); one contract
package feeds both sides.

**Bad**: four small files per feature action instead of one — more navigation, justified only where
there is orchestration to isolate (a trivial read may collapse `usecase` into a one-liner). CSS
Modules need a Vite/Vitest config that understands `.module.css` (already present via
`@vitejs/plugin-react`). Self-hosted fonts add ~200 KB of woff2 as separate cached assets — not
counted against the JS budget, downloaded once.

## Reversal

The design tokens are plain CSS variables; swapping to Tailwind or another styling system is a
primitive-by-primitive rewrite behind stable component APIs. The layer split is a folder convention,
not a framework — collapsing `usecase` into `hook` for a given feature is a local refactor.
