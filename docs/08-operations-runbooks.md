# Veyrox Food — Operations & Runbooks

On-call is one person, permanently. This document exists so that person — me, at 08:30, on a phone, in a café, with the owner watching — does not have to think from first principles.

**Rule for every runbook here: it is fiction until it has been executed.** Each is rehearsed at least once (game days, `07-test-and-quality-strategy.md` §10) and corrected afterwards.

---

## 1. Alerting policy

Two tiers. Nothing else exists.

| Tier | Meaning | Channel | Examples |
|---|---|---|---|
| **PAGE** | The café is losing money or data right now, or will within minutes | Phone call + push, 24/7 during café hours; push-only 01:00–07:00 | Ordering path down · **any invariant violation** · database unreachable · backup restore failed · habit rail sending outside its cap |
| **TICKET** | Real, but it can wait for Wednesday's ops block | Email digest | Elevated latency · a failed non-critical job · dependency CVE · ETA drift · console errors |

**An alert that is neither gets deleted, not downgraded.** Alert fatigue for a solo operator is a future total outage: the page you ignore because the last nine were noise is the one that mattered.

Every PAGE alert carries a link to its runbook in the alert body. If it does not have one, it is not allowed to be a PAGE.

---

## 2. First response — the 90-second triage

Before opening any specific runbook:

1. **Open the Café Health dashboard.** Orders in the last 15 min, New-column depth, queue depth, error rate, open SSE connections, ETA error.
2. **Ask the one question that matters: can the café still take money?** If yes, this is not a page-level incident regardless of what the alert said — downgrade it and think clearly.
3. **If no: engage Safe Mode** (§3) before diagnosing. Restore the ability to trade first, understand second.
4. Grab the `traceId` from the alert. One trace usually answers it (NFR-53).
5. Tell the café owner what is happening, in one sentence, in Arabic. **Silence is worse than bad news** — an owner who does not know is an owner improvising.

---

## 3. Safe Mode

One flag: `safe_mode.enabled = true`. Propagates in ≤30s. Flip it from the **Platform Admin → Flags** screen, or — if the Admin console is itself broken, which it may well be if the incident is a bad deploy — from the CLI:

```
veyroxai flags set safe_mode true --reason "RB-x: <what is happening>"
```

**Every kill switch has both paths** (NFR-57a). A recovery mechanism reachable only through a web app has failed with the thing it was meant to recover.

**Keeps**: Till order creation, send-to-kitchen, cash/visa payment recording, KDS board, offline outbox.
**Disables**: Habit Engine, Review Shield, AI add-ons, digest, upsell/cross-sell, LLM calls, non-essential jobs.
**Degrades**: WhatsApp ordering can be switched off entirely, leaving the counter trading normally.

This is the correct first action for most 08:30 incidents. It reduces the system to the part that keeps the café trading and removes every surface that could be causing the problem.

---

## 4. Runbooks

### RB-1 — Ordering path down *(PAGE)*

**Symptom**: synthetic order prober failing 3× consecutively, or no orders in 15 minutes during peak hours.

1. Check the Fly.io health of `api`. If unhealthy → `fly apps restart veyroxai-api`.
2. Check Postgres reachability (Neon status + a direct query). If the database is down → **RB-6**.
3. Check the Meta webhook: has anything arrived recently (`inbound_events`, last 15 min)? If nothing, the failure is upstream at Meta or in webhook verification — check whether the app secret was rotated.
4. Check the last deploy. **If a deploy landed in the last hour, roll back first and diagnose after**: `fly deploy --image <previous-digest>`. Under 3 minutes (NFR-54).
5. Tell the owner: *"WhatsApp ordering is down, the counter still works normally, I am on it."* The Till is unaffected by design and that is the sentence that keeps them trading.
6. Post-incident: why did the prober catch this before I did — or did it not, and why?

### RB-2 — Orders piling up unaccepted *(TICKET, escalating to PAGE during a rush)*

Replaces the old payment-failure runbook, which no longer applies: **v1 has no payment provider** (ADR-0010), so there is no PSP to fail and no "charged but no order" case. The equivalent operational risk is now the accept gate stalling.

**Symptom**: `order.stale_new` alerting on `placed` orders older than 2 minutes, or a customer reporting no confirmation.

1. Check the KDS **New** column depth on the Café Health board. If it is deep, this is a staffing or workflow problem, not a software one — call the café.
2. Confirm the KDS is actually live: is the staleness banner showing (RB-4)? An unaccepted queue is often a disconnected board, not an inattentive barista.
3. If the café is closed or closing, the orders should not have been accepted at all — check `store_hours` and whether the closed-state reply (FR-2.3) is working.
4. Customers with unaccepted orders have been told nothing yet. If the backlog is real and the café cannot clear it, have staff **reject** with a reason so customers get a message rather than silence. A rejected order costs nothing; an ignored one costs a customer.
5. Post-incident: was the accept-gate threshold wrong, or was the board not visible from where the barista stands? The second is the more common answer, and it is a café-layout fix, not a code fix.

### RB-3 — Ledger invariant violated *(PAGE — highest severity)*

**Symptom**: `invariant.check` reports an INV-1..INV-7 violation.

This is the most serious alert in the system. The books are wrong.

1. **Do not "fix" the data yet.** Snapshot first: the `invariant_violations` row, the affected `order_id`s, and the full `material_ledger` history for those orders.
2. Determine scope: one order, or a class? `SELECT` the violation query without its `LIMIT`.
3. If it is a class, **freeze the code path**: set `safe_mode`, and if voids are implicated, disable voiding (`void.enabled = false`) so the Till requires a manual paper note temporarily. Stopping the bleeding beats fixing the wound.
4. Find the cause in `order_events` and the traces — every ledger row carries the actor and the trace.
5. **Corrections are compensating rows with `reason='manual_adjustment'` and a note, never UPDATEs.** The ledger is append-only; correcting it by mutation destroys the audit trail that lets you prove what happened.
6. Write a postmortem (§7). This one is non-optional — INV-1 failing means the core correctness claim of the product failed, and the design that was supposed to make it impossible needs to be understood.

### RB-4 — KDS blank or stale during a rush *(PAGE)*

**Symptom**: staff report a blank or frozen board.

1. **Have the staff pull-to-refresh first.** Resolves most cases; say it before diagnosing.
2. Check whether the staleness banner was showing. If it was, the client knew its stream was dead — reconnect-and-replay should have healed it. If it did not, that is the bug.
3. Check open SSE connections and `sse_replay_gap` on the dashboard. A client stuck reconnecting usually means a proxy is buffering or the heartbeat stopped; verify the board itself is correct via `GET /staff/board`.
4. If the API is fine and clients are broken, roll back the SPA (Cloudflare Pages instant rollback — seconds).
5. **Interim workflow**: the Till can print or read out tickets. Tell the staff this immediately rather than letting them stand there.

### RB-5 — Café offline (their internet is down)

**Symptom**: owner reports "nothing works."

1. Confirm it is their connectivity, not us (the prober will be green).
2. Reassure: **the Till works offline** — create orders, send to kitchen, take cash. This is designed behaviour (FR-4.9).
3. **Card payments must be taken on their standalone terminal and recorded in the Till as Visa when connectivity returns.** Say this explicitly; staff will otherwise assume they cannot take cards.
4. WhatsApp ordering is unavailable until they are back; customers ordering remotely will simply not get through.
5. On recovery, watch the outbox flush and confirm the order count matches what the staff counted on paper.

### RB-6 — Database down or degraded *(PAGE)*

1. Check Neon status and connection-pool saturation.
2. If it is a pool problem, restart `api` — this clears leaked connections and is usually the whole fix.
3. If Neon is genuinely down: the API returns 503, the Ops SPA runs fully offline from cache and outbox, nothing is lost. **Communicate this shape to the owner** — "the counter keeps working, it will catch up" is a very different message from "everything is broken."
4. If data loss is suspected → **RB-7**.

### RB-7 — Restore from backup *(PAGE, rehearsed as GD-5)*

Target: RPO ≤5 min, RTO ≤1h (NFR-20, NFR-21).

1. **Stop all writes**: scale `api` to zero and pause all workers. A restore racing live writes produces a worse state than the outage.
2. Identify the restore point from the incident timeline — the last known-good moment, not the moment of detection.
3. PITR restore to a **new** instance. Never restore in place; the damaged instance is evidence.
4. **Run the full invariant suite against the restored instance before pointing anything at it.**
5. Repoint, scale back up, replay any recoverable inbound events from the gap (`inbound_events` is append-only and may extend past the restore point on the provider's side — Meta will have retried).
6. Reconcile the gap window against the café's own records. With no PSP there is no external ledger to check against, so the drawer count and their terminal's settlement report are the only cross-checks — ask the owner for both.
7. Tell the owner exactly what window of data was affected and what they need to re-enter. Be specific; vagueness here is what destroys trust.

### RB-8 — Habit Engine session banned or dead *(TICKET, not PAGE)*

**This is expected, not exceptional** (PRD R1). It is a ticket because it costs retention messages, not trading.

1. The health probe has already frozen the worker. **Confirm it did not auto-reconnect** — reconnect storms raise the ban probability for the replacement number too.
2. Confirm the blast radius is contained: ordering rail unaffected, no shared credentials, no shared IP. This is the moment the isolation design either pays off or does not.
3. Decide, deliberately:
   - **Option A** — flip `habit.channel = cloud_api`. Templates are pre-approved (FR-7.11). Retention resumes within minutes at a per-message cost.
   - **Option B** — rebuild the habit host and pair a new number (Terraform + cloud-init, <30 min), and re-pair per the documented procedure.
4. Record the ban in the R1 log: date, number, message volume in the preceding 7 days, and anything that changed. **Over time this log is the only real evidence about what triggers bans**, and it is what will eventually justify moving permanently to the official rail.
5. If this is the second ban in 90 days, escalate the decision: the whatsapp-web.js rail's economics have changed and PRD §8.9's migration item should be scheduled.

### RB-9 — Google Business Profile warning or suspension *(PAGE — business impact)*

**Symptom**: the café reports a review-policy warning or a suspended profile (PRD R2 materializing).

1. **Immediately set `review_gating.enabled = false`.** The compliant variant is already built and takes over (FR-6.5): every customer is asked for a public review; only the private owner alert stays conditional.
2. Export the `review_requests` audit trail — every rating, every routing decision, and the flag state at send time (FR-6.7). This is exactly why that table exists.
3. Support the café's appeal with that evidence and with the confirmed date the gating stopped.
4. Escalate to the founder: R2 has moved from accepted risk to realized cost, and the decision should be revisited with real data rather than re-defended.

---

### RB-10 — Owner misconfiguration *(TICKET)*

**Symptom**: owner reports items missing from the menu, wrong prices, or a feature they expected being off.

1. **Check the resolved feature state first**, not the flags. `GET /admin/tenants/:id` shows every feature with its reason: `platform_disabled`, `not_entitled`, or `owner_disabled`. That reason is the whole diagnosis in most cases — an owner reporting "the AI thing disappeared" is usually `suspended` for non-payment, not a bug.
2. For a menu problem, check `menu_revisions`: is there an **unpublished draft**? The most common report by far is an owner who made changes and did not publish them.
3. Check the tenant's audit log for what changed and when. Every setting write records actor and timestamp.
4. If they configured themselves into a broken state, use **restore defaults** for that section (FR-10.6) rather than hand-editing values.
5. **Do not fix it by impersonating and changing their settings** unless they explicitly ask. Walk them through it — an owner who does not know how to change their own price will be back tomorrow, and the point of the Store Console is that they do not need me.

### RB-11 — Platform Admin compromise suspected *(PAGE — highest severity alongside RB-3)*

**Symptom**: unexpected `platform_audit` entries, an impersonation session I did not start, or a lost/stolen hardware key.

1. **Revoke every platform session immediately** and disable the affected `platform_users` row. CLI path, in case the console itself is the vector.
2. Rotate the database credentials, the JWT signing key, and every provider credential (`09-security-privacy-compliance.md` §9). Assume anything the admin surface could read is disclosed.
3. **Read `platform_audit` end to end** for the exposure window. It is append-only, carries before/after and a mandatory reason, and is the only reliable account of what was done.
4. Check `impersonation_sessions` for any session in the window; every one of them is also visible in the affected tenant's own log, so the tenants can verify independently.
5. Assess whether personal data was accessed → 72-hour PDPL breach assessment, cafés notified in parallel since they are the controllers.
6. Postmortem required. This is the one incident class where the blast radius is every café at once.

---

## 5. Routine operations

| Task | Cadence | Notes |
|---|---|---|
| Ops block | Weekly, Wed, 2h | Tickets, error budget, invariant reports, dependency updates, rehearse one runbook |
| Backup restore verification | **Monthly, automated** | Restores to a scratch DB and runs all invariants. Failure pages (NFR-22) |
| Secret rotation | Quarterly, or immediately on suspicion | Meta app secret, database credentials, JWT signing key, phone-hash key, device tokens. Rehearsed once before GA |
| Dependency updates | Weekly in the ops block | Security patches same-day |
| Cost review | Monthly | Especially template-message spend (NFR-49) — the early warning for R6 |
| Menu/price audit with the owner | Monthly | Catches placeholder costs creeping back in and prices drifting from reality |
| Error budget review | Mid-month and month-end | If >50% consumed at mid-month, the next sprint starts with reliability work |

---

## 6. Deployment and rollback

**Deploy** (<10 min): merge to `main` → CI → staging → smoke → manual promote → migrate production → Fly rolling deploy with health checks → smoke.

**Rollback** (<3 min): `fly deploy --image <previous-digest>` for the API and workers; Cloudflare Pages instant rollback for the SPAs.

**Migrations are never rolled back.** They are expand/contract, so the previous image runs against the new schema. This is the rule that makes rollback a 3-minute operation instead of a 3-hour one, and it is worth the extra release cycle it costs on every schema change.

**Deploy freeze**: no production deploys 07:00–11:00 or 17:00–21:00 Cairo (the two rushes), and none on a Friday afternoon. Emergencies excepted — and an emergency deploy during a rush should almost always be a rollback rather than a fix.

---

## 7. Incident management, solo

| Severity | Definition | Response | Postmortem |
|---|---|---|---|
| **SEV1** | Café cannot trade, or data loss/corruption | Immediate, drop everything | **Required** |
| **SEV2** | Major feature down, workaround exists | Same day | Required if repeated |
| **SEV3** | Degraded, no material impact | Next ops block | No |

**During**: keep a running timeline in a scratch file from minute one. Reconstructing it afterwards from memory produces a postmortem that is fiction.

**Postmortem** (one page, blameless — which for a solo operator means honest rather than self-flagellating):
what happened · timeline · why the safeguards did not catch it · what changes (code, alert, runbook, or design) · **what test or invariant would have caught it, and is it now written**.

That last line is the whole point. A postmortem with no new test is a postmortem that will be written again.

---

## 8. Café-facing support

The owner and staff are not IT people, and their WhatsApp message to me is the real alerting channel for half of everything.

| Their report | Almost always means | First response |
|---|---|---|
| "Nothing is working" | Their internet | RB-5 — and lead with "the Till still works" |
| "Orders aren't coming through" | Meta or webhook | RB-1 |
| "The screen is stuck" | Realtime or a stale client | RB-4 — tell them to pull-to-refresh *first* |
| "The numbers are wrong" | Usually a voided order they expected to see netted, or a placeholder cost | Check invariants first, then walk through the specific order with them |
| "My order never came through" | Unaccepted on the KDS, or the café was closed | RB-2. Use **Admin → Support → order lookup**, which shows the timeline, ledger, payment, and messages in one screen |
| "I changed the price but it didn't change" | An unpublished menu draft | RB-10 step 2 |
| "The AI feature disappeared" | Entitlement `suspended` (billing) or `not_entitled` | RB-10 step 1 — the resolved reason is the answer |

**Support commitments**: response within 15 minutes during café hours, within 2 hours otherwise. A monthly 30-minute check-in with the owner that is not about an incident — that call is where you learn the workflow problems nobody thought to report, and it has consistently more product value than any dashboard.
