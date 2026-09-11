---
name: pixel-perfect-frontend
description: Use for ANY UI/UX or frontend task in this repo — building, editing, or reviewing a screen in code/frontends/* or code/packages/ui. Also use whenever the user references a design source (a Stitch export, a Figma link, a zip of screens/images, a screenshot of a target design, or any "make it look like X" request). Forces design-file analysis (both images and any exported code), derivation of a design system from what's found, pixel-perfect matching with an explicit compare-iterate loop, an explicit placeholder policy for missing assets, and researched component-library choices — before any screen is reported done.
---

# Pixel-perfect frontend work

This skill governs every UI/UX or frontend task in this repo: new screens, edits to
existing screens, component work in `code/packages/ui`, or "match this design" requests.
It does not replace `docs/14-code-structure-and-conventions.md`, ADR-0018 (frontend
feature layering), or any other project doc — it adds a mandatory design-fidelity
process on top of them.

**Do not report a screen finished, move to the next screen, or hand back to the user
until every step below has actually happened for that screen.** "I implemented it" is
not done. "I compared it against the design and it matches, here's what's a
placeholder" is done.

## 0. Find every design source in play

Before writing code, locate and open **all** design material the task touches — not
just the one file named in the prompt:

- Any file the user just mentioned or attached (zip, image, Figma URL, PDF).
- `stitch_whatsapp_caf_ordering_app.zip` at the repo root, when the task touches
  ordering/menu/cart/checkout/status screens — this is the F1 customer-ordering design
  source. Unzip it (to your scratchpad, never committed into the repo) rather than
  guessing from a filename.
- `docs/14-stitch-design-prompts.md` — the prompts used to generate that export; read
  it for intent even when the rendered screen looks ambiguous.
- Any other `docs/` reference to a design file for the surface you're touching.

**A Stitch export (or similar AI design-tool export) ships both rendered images and
generated code (HTML/CSS or React) per screen.** Open both:

- The **images** are the visual source of truth for pixel-fidelity: exact spacing,
  proportions, imagery, iconography, copy.
- The **generated code** is a second source of truth for *tokens*: it usually contains
  literal color values, font stacks, spacing numbers, and radii that are tedious or
  impossible to eyeball reliably from a screenshot. Read it even if you will never ship
  a line of it.

If the user names a design file this skill hasn't seen before (a new zip, a Figma
frame, a screenshot), apply this same process to it — the instructions above are the
pattern, not a fixed file list.

## 1. Derive a design system from what you found — don't invent one

From the design code + images, extract, as concrete values:

- **Color** — every distinct color used (surfaces, text, borders, states, brand
  accents), not just the obvious brand color.
- **Typography** — font family/stack, the full size scale actually used, weights,
  line-heights, letter-spacing.
- **Spacing** — the spacing scale (margins, paddings, gaps) as it actually appears,
  not a generic 4/8px guess.
- **Radii, shadows/elevation, borders** — per surface type (cards, buttons, sheets,
  pills).
- **Motion** — durations/easing if the export or prompts imply any.
- **Iconography and imagery style** — line vs. filled icons, corner treatment on
  photos, placeholder art style.

Then **reconcile against this repo's existing tokens** at
`code/packages/ui/src/tokens/*.css` and the primitives in `code/packages/ui/src`.
This repo already has a token system and a component layer (ADR-0018) — the job is to
extend/correct it to match the design, not to bypass it with inline styles or a second,
parallel token system living in a feature folder.

- Where the design matches existing tokens: use the existing token/component. Do not
  restate its value locally.
- Where the design's value differs from an existing token in a way that looks
  **global** (e.g. the whole palette shifted, a new type scale step): update the token
  file and say so explicitly in your summary — this is a design-system change, not a
  one-screen hack.
- Where documents/designs conflict on observable behavior or values in a way that
  looks **material** (not just "this one screen's accent is 2 shades off"): stop, per
  the repo's working rule 2, and surface the conflict to the user or in an ADR before
  coding around it silently.

Write down the derived system briefly as you work (a short note in your own scratch
file is enough — don't create a permanent docs file unless asked) so later screens in
the same task stay consistent with earlier ones instead of re-deriving ad hoc.

## 2. Component library research — don't default to hand-rolling everything

Before building a non-trivial interactive primitive (dropdown, dialog, combobox, date
picker, toast, tabs) that doesn't already exist in `code/packages/ui`, search the web
for current best-in-class options rather than assuming shadcn/ui is automatically
right or reflexively writing it from scratch. Libraries and their maturity change —
verify freshness, don't rely on stale memory. Candidates worth checking (non-exhaustive
starting point, confirm current state):

- **shadcn/ui** — copy-in components over Radix/Tailwind; good when you want owned,
  editable source rather than a runtime dependency.
- **Radix Primitives** / **Base UI** (Radix + Material teams) — unstyled, accessible
  behavior primitives.
- **React Aria / React Aria Components** (Adobe) — accessibility-first behavior hooks,
  framework-agnostic styling.
- **Ariakit**, **Headless UI** — similar unstyled-behavior space, lighter footprint.
- Framework-specific and CSS-approach fit: this repo is React 19 + Vite + **CSS
  Modules**, not Tailwind — weigh how much rework a library's styling model costs
  before picking it.

Whatever you pick must fit this repo's actual constraints, checked against
`CLAUDE.md`/`docs/14-code-structure-and-conventions.md`:

- `code/packages/ui` is the shared component layer — a new primitive is added there,
  not copy-pasted into a feature folder.
- No new runtime dependency that conflicts with the CSS Modules styling approach
  without a plan to bridge it.
- **Adopting a new component library (as opposed to using one occasionally-referenced
  pattern) is a material technical decision** — write the ADR (working rule 1) instead
  of quietly adding it to `package.json`.
- Bundle budget: `frontends/order` has a 150KB gz `size-limit` gate — a heavy
  dependency there needs justifying, not just wanting.

## 3. Build inside the existing structure — no exceptions

Follow ADR-0018 and `docs/14-code-structure-and-conventions.md` exactly:

- Every feature folder keeps the six layers: `ui/`, `components/`, `hooks/`,
  `usecases/`, `repo/`, `datasource/`.
- No cross-feature imports. Shared visual primitives go in `code/packages/ui`; shared
  logic in `code/packages/domain` or the relevant context.
- No barrel files, no new top-level directories invented for "just this design," no
  parallel ad hoc styling system next to the CSS Modules already in use.
- RTL: every screen must work in both directions (`docs` non-negotiable) — check the
  Arabic locale too, not just English, before calling a screen done.
- Money is `Minor`/integer piastres end to end — a design showing "EGP 70" is display
  formatting over an integer, never a float introduced in the UI layer.

If matching the design would require breaking one of these, that's a conflict to
surface (per §1's reconciliation rule), not a reason to bend the architecture quietly.

## 4. The compare-iterate loop — mandatory, per screen

For every screen you touch:

1. Implement a first pass.
2. Run the app (use the project's `run` skill / dev server) and get a real screenshot
   of the rendered screen — in the browser, at the actual target viewport width, not a
   guess from reading JSX.
3. Place that screenshot next to the design image (same crop/scale) and go element by
   element: header, every card, every input, every icon, every image, every piece of
   spacing, every color, every piece of text truncation. Note every mismatch, not just
   the obvious ones.
4. Fix the mismatches.
5. Re-screenshot and re-compare.
6. Repeat 2–5 until the rendered screen matches the design, or the only remaining gap
   is a missing asset (§5) or a flagged conflict (§1).

Do not skip step 3's side-by-side comparison and rely on "it looks right" from the
code. Do not move to the next screen, and do not tell the user a screen is ready, until
this loop has actually run and converged for the current one.

## 5. Missing-asset policy

When the design references an asset you don't have (a specific photo, icon, illustration,
font file, logo mark):

- Never silently substitute a random stock image, an unrelated icon, or invent brand
  art and present it as final.
- Insert a clearly-marked placeholder in its exact slot (correct dimensions/aspect
  ratio so layout is still verifiable) — e.g. a labeled gray box, a placeholder
  `Icon` with an obvious "placeholder" data attribute or dev-only outline, or existing
  placeholder patterns already in this codebase (check `menu-model`/catalog fallbacks
  before inventing a new one).
- **Explicitly tell the user, per screen, exactly which elements are placeholders and
  what real asset is needed** — don't bury it in a diff; say it in your summary. A
  screen with an unflagged placeholder is not "done."

## 6. Definition of done for a screen

All of the following, or it isn't done:

- [ ] Design source(s) for this screen opened — images and any exported code.
- [ ] Design-system values used came from §1's derivation/reconciliation, not guessed.
- [ ] Built inside the existing six-layer structure, no architecture violations.
- [ ] Compare-iterate loop (§4) actually run with real screenshots, to convergence.
- [ ] Any missing assets are placeholder-marked and called out to the user by name.
- [ ] RTL checked.
- [ ] Any global token change, any new dependency, or any design/doc conflict is
      surfaced to the user (and ADR'd if material) rather than silently absorbed.
