# ADR-0021 — Customer session tab restoration

**Status**: Accepted · **Date**: 2026-09-11

## Context

The customer CTA enters at `/s/<token>`, but normal in-app navigation deliberately
uses clean paths such as `/menu`, `/pairings`, and `/checkout`. Reloading one of those
paths created a fresh client state with no token, leaving the application in a perpetual
loading state even though the customer still held a valid 15-minute session.

The token is already visible in the CTA URL, is tenant-bound, contains no personal data
in the clear, and grants only public catalogue and order-placement access. Persisting it
more broadly would nevertheless expand its exposure to future browser sessions.

## Decision

After a successful customer-session resolution, store the opaque token in browser
`sessionStorage`, under one dedicated key and with a 2,048-character upper bound. Use it
only to recover an internal route in the same browser tab. Before rendering protected
customer content after recovery, call `GET /public/session/:token`; signature, tenant
binding, enabled state, and expiry remain entirely server-authoritative.

Do not use a cookie or `localStorage`. Clear the stored token after
`SESSION_EXPIRED`, `SESSION_INVALID`, or `WHATSAPP_ORDERING_DISABLED`. Retain it through
network and `STORE_CLOSED` errors so the customer can retry within the existing server
TTL. An internal route with no recoverable token renders the existing reopen-session
state, never an infinite loader.

## Alternatives considered

**Keep the token only in memory.** Rejected: it cannot survive the normal browser
refresh that prompted this decision.

**Use `localStorage`.** Rejected: it survives tab closure and is available to every tab
on the origin, which is unnecessary exposure for a 15-minute webview capability.

**Use a server-side cookie session.** Rejected: it adds state and CSRF/cookie policy to
an intentionally stateless, WhatsApp-issued session design without improving the
existing server verification.

## Consequences

Customers can refresh a clean internal route without being stranded, while closing the
webview tab removes the restoration copy. This does not eliminate the URL/XSS token
theft threat; the scope remains bounded by the current TTL, tenant binding, public-only
authority, and server re-verification. No backend contract, schema, or migration changes
are required. This is an F1 defect fix: no milestone moves and nothing is displaced from
the explicit cut list.
