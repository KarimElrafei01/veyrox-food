export interface SseSubscriber {
  write(chunk: string): void;
}

export interface SsePublishedEvent {
  /** Echoed as the SSE frame's `id:` line - exactly what a reconnecting client
   *  sends back as `Last-Event-ID`. A uuid v7 (order_events.id), not an int.
   *  Omit for an event with no order_events row of its own (kitchen_state.changed
   *  - operational metadata, not an order fact, so it has nothing to attach an
   *  id to): it is then live-only, never part of Last-Event-ID replay, which is
   *  fine because GET /staff/board's own snapshot already carries the current
   *  authoritative value as the correction mechanism after any gap. */
  id?: string;
  event: string;
  data: unknown;
}

/**
 * In-process fan-out, keyed by tenant_id from day one (backend doc §4.1/§4.2) -
 * Phase 0/1 is one API process, so this is the entire mechanism; the only thing
 * Phase 2 (multiple instances) has to change is *how* a commit on instance B
 * reaches a subscriber on instance A, never *how tenants are isolated* while
 * doing so, per ADR-0005's own stated upgrade path.
 */
export class SseHub {
  private readonly subscribersByTenant = new Map<string, Set<SseSubscriber>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  subscribe(tenantId: string, subscriber: SseSubscriber): () => void {
    let subscribers = this.subscribersByTenant.get(tenantId);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribersByTenant.set(tenantId, subscribers);
    }
    subscribers.add(subscriber);
    this.ensureHeartbeat();
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) this.subscribersByTenant.delete(tenantId);
    };
  }

  /** Must be called from a commit hook, after the transaction that produced
   *  `event` has actually committed (ADR-0005 §4.1) - never inline in the
   *  transaction body, or a rolled-back mutation could still notify a tablet. */
  publish(tenantId: string, event: SsePublishedEvent): void {
    const subscribers = this.subscribersByTenant.get(tenantId);
    if (!subscribers?.size) return;
    const chunk = formatSseEvent(event);
    for (const subscriber of subscribers) subscriber.write(chunk);
  }

  subscriberCount(tenantId: string): number {
    return this.subscribersByTenant.get(tenantId)?.size ?? 0;
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) return;
    // ADR-0005 requirement 1: Cloudflare and Fly both kill idle connections
    // without this. One shared timer, not one per connection - café scale is a
    // handful of tablets per tenant, a handful of tenants per process.
    //
    // A named event, not a bare SSE comment (ADR-0005's 2026-09-12 amendment):
    // a comment line is invisible to the browser's EventSource API by spec, so
    // the frontend staleness watchdog (FR-3.6) has nothing to listen for if
    // this stays a comment - it still resets proxies' idle timers either way.
    const heartbeat = formatSseEvent({ event: 'heartbeat', data: {} });
    this.heartbeatTimer = setInterval(() => {
      for (const subscribers of this.subscribersByTenant.values()) {
        for (const subscriber of subscribers) subscriber.write(heartbeat);
      }
    }, 20_000);
    this.heartbeatTimer.unref?.();
  }

  /** Test/shutdown only - lets the heartbeat interval stop holding the process open. */
  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

export function formatSseEvent(event: SsePublishedEvent): string {
  const idLine = event.id !== undefined ? `id: ${event.id}\n` : '';
  return `${idLine}event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
