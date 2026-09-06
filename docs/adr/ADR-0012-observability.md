# ADR-0012 — OpenTelemetry to Grafana Cloud, plus Sentry

**Status**: Accepted · **Date**: 2026-09-05

## Context

One person is on call, permanently. NFR-53 sets a target of diagnosing an incident in under 10 minutes from a dashboard plus one trace. The data being observed includes phone numbers, which must never be stored by a third party.

## Decision

- **OpenTelemetry SDK** for traces, metrics, and logs, exported to **Grafana Cloud** (Tempo, Prometheus, Loki) — free tier is sufficient well past 50 cafés.
- **Sentry** for error tracking in the API and all five SPAs, source-mapped and release-tagged.
- **`packages/observability`** owns setup, the structured logger, and a **redaction processor**.
- Two dashboards, not twenty: **Café Health** and **System Health**.

## Redaction at emit, not at query

The redaction processor strips phone-shaped strings, session tokens, and message-body fields from every log line, span attribute, and error report **before it leaves the process**.

This is deliberately at emit time rather than at query time. Redacting at query time still means the raw personal data was transmitted to a third party, retained under their policy, and included in their backups — which is a disclosure, not a display problem. Emit-time redaction means the data was never sent.

Enforced by a test that logs a synthetic record containing a phone number and asserts the emitted payload does not contain it (NFR-35).

## Business metrics are first-class signals

Alongside RED metrics on the API and queue depth on the workers, these are exported as ordinary Prometheus metrics:

`orders_per_hour` · `void_rate` · `eta_error_seconds` · `payment_success_rate` · `habit_sends` and outcomes · `realtime_connections` · `invariant_violations`

They sit on the same dashboard as the technical ones, because **a business metric anomaly usually precedes a technical alert.** Orders dropping to zero at 08:40 is visible ten minutes before the error rate moves, and it is the thing that actually tells you the café has stopped trading. Splitting business and technical telemetry into separate tools is how a solo operator ends up looking at the wrong screen during an incident.

## The Café Health dashboard

One screen, readable on a phone, showing exactly what is needed at 08:30 in a café: orders in the last 15 minutes, live queue depth, ETA error, API error rate, payment success rate, realtime connection count, and any open invariant violation.

The standard it is held to: **if an incident cannot be diagnosed from this board plus one trace, the instrumentation is the bug**, and fixing it is part of that incident, not a follow-up ticket.

## Alternatives considered

**Datadog or New Relic.** Rejected on cost at this revenue stage, and their value is mostly at a scale of complexity this system deliberately does not have.

**Self-hosted Grafana + Loki + Tempo.** Rejected — one more thing to operate, and observability that goes down with the thing it observes is worth very little.

**Logs only, no traces.** Rejected. Tracing is what makes "why did this specific customer not get their ready message?" a single query across the webhook, the job, and the outbound send, rather than three log searches correlated by hand.

**Sentry only.** Rejected. Errors tell you something broke; they do not tell you that orders quietly stopped arriving, which is the failure mode that costs the café money.

## Consequences

**Good**: three signals in one place with one query language; `trace_id` propagates end to end from the webview through the API into jobs; free tier covers the plan horizon; personal data never leaves the process.

**Bad**: OTel setup is fiddly, and instrumentation must be maintained as new code paths appear. Mitigated by centralizing it in `packages/observability` so a new route or job is instrumented by construction rather than by remembering.
