# ADR-0009 — Five Vite React SPAs; no SSR framework

**Status**: Accepted · **Date**: 2026-09-05

## Context

Five browser surfaces: the customer ordering webview (public, token-gated, opened inside WhatsApp), the KDS and the Till (staff, offline-capable), the Store Console (auth-gated), and the Platform Admin (auth-gated, highest privilege). The obvious default in 2026 is Next.js.

## Decision

**Five Vite + React 19 single-page applications**, deployed as static assets to Cloudflare Pages. **No Next.js, no SSR, no server runtime for any frontend.**

- `apps/order` — customer webview. Hardest performance budget.
- `apps/kds`, `apps/till` — separate PWAs sharing `packages/ops-core` (see amendment above).
- `apps/console` — Store Console: owner analytics, costing, and configuration/CRUD.
- `apps/admin` — Platform Admin: fleet operations. Separate auth realm, mandatory WebAuthn (ADR-0014).

## Rationale

**SSR buys nothing here, and it is not close.** Its three real benefits are SEO, first-paint on content-heavy public pages, and server-side data access. None apply:

- **SEO**: all five surfaces are behind a token or a login. There is nothing to index. The ordering webview is reached from a signed link in a WhatsApp message, not from Google.
- **First paint**: the ordering webview is a small, highly interactive app, not a content page. A tight SPA within the 150 KB budget hits the 2.0s target on 4G without a server round-trip for HTML.
- **Server-side data access**: the API already exists and is the single write path. An SSR layer would be a second server calling the first one.

What SSR *would* cost is real: a server runtime to deploy, scale, and monitor for each frontend, an additional hosting dependency, a more complex local development story, and framework-specific rendering rules that must be understood before every data-fetching decision. For a solo operator, that is five more things to be on call for, in exchange for nothing.

**Why the staff apps in particular could not be SSR:** it must run with no network at all (ADR-0006). Server rendering is meaningless for a surface whose primary reliability requirement is working while the server is unreachable.

## Amendment, 2026-09-06 — KDS and Till are now separate apps

**Reversed by decision.** The section below argued for one app; the requirement is now a separate folder per service, so `apps/ops` becomes `apps/kds` and `apps/till`.

The reasoning below still identifies a real cost, so it is not deleted — it is answered. Everything device-shaped that the merge existed to share (offline outbox, service worker, device enrollment, staff PIN flow, SSE client, staleness banner) moves to **`packages/ops-core`** and is imported by both apps. Nothing is written twice; only the shell and routing differ.

**Residual cost, accepted:** a café tablet doing both jobs installs two PWAs rather than one. Worth watching during the pilot — if staff find switching between two installed apps awkward on one device, that is a real workflow signal, not a cosmetic one.

The SSR decision in the rest of this ADR is unaffected. There are five browser surfaces, all still static, all still without a server runtime.

## Why KDS and Till were one app *(superseded reasoning, retained)*

Same devices, same room, same auth, same offline requirements, same realtime subscription. Splitting them would duplicate the service worker, the outbox, the auth flow, and the deploy surface for no benefit. They are two routes; a device is enrolled as `kds`, `till`, or `both`.

## Why the ordering webview is separate

Different everything: unauthenticated, a far stricter performance budget, a different release cadence, and a different threat model. Bundling it with staff code would ship staff routes to the public and blow the budget.

## Alternatives considered

**Next.js for all five.** Rejected above.

**Next.js for the console only.** Rejected — a second framework and a second hosting model to maintain for the *least* performance-sensitive surface in the system.

**Astro or plain HTML for the ordering flow.** Genuinely tempting for the perf budget. Rejected because the cart is meaningfully stateful and interactive, and because sharing `packages/ui` and `packages/i18n` across all five surfaces (RTL layout in particular) is worth more than the last few kilobytes.

## Consequences

**Good**: static hosting on a global CDN, near-zero hosting cost, instant rollback, trivially simple deploys, no server runtime to operate, and one build tool across all five apps.

**Bad**: no server-side rendering means the performance budget must be defended actively — which is why it is a **failing** CI check rather than a warning (NFR-9, NFR-10). If a genuinely public, indexable marketing surface is ever needed, it will be a separate concern, and that is the right place for it anyway.
