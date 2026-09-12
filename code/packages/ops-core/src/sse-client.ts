/**
 * Thin wrapper over the browser's native `EventSource`, shared by kds + till
 * (ADR-0005/ADR-0009). Schema-agnostic on purpose - parsing a frame's `data`
 * against a contract schema is the caller's feature-level `datasource/` job
 * (ADR-0018), not this package's; this only knows about the SSE wire shape.
 *
 * Reconnection itself is deliberately NOT hand-rolled: ADR-0005 picked SSE
 * specifically because `EventSource`'s automatic reconnect-with-`Last-Event-ID`
 * is "free" and reimplementing it is "exactly where such code is wrong."
 * `reconnect()` exists only for the screen 3.3 "Retry Now" button, which needs
 * to bypass the browser's own retry delay, not replace its logic.
 */
export interface SseFrame {
  /** uuid v7 from `id:`, or null for a live-only frame (kitchen_state.changed
   *  carries none - see SsePublishedEvent's backend-side doc comment). */
  id: string | null;
  event: string;
  data: unknown;
}

export interface StaffStreamOptions {
  baseUrl: string;
  deviceToken: string;
  /** Resume position from the last GET /staff/board snapshot's asOfEventId,
   *  or a previously-received frame's id - the very first connection's replay
   *  range. Subsequent browser-driven reconnects supply their own via the
   *  standard Last-Event-ID header, which this never needs to touch. */
  lastEventId?: string | null;
  /** Named SSE events to subscribe to - `EventSource.onmessage` only fires for
   *  the unnamed default "message" event, and every frame this feature sends
   *  is explicitly named (backend doc's formatSseEvent), 'heartbeat' included. */
  eventNames: readonly string[];
  /** FR-3.6: no message (heartbeat or real) within this window means stale.
   *  Default 10_000. */
  staleAfterMs?: number;
  onEvent: (frame: SseFrame) => void;
  onStaleChange: (stale: boolean) => void;
  /** Injectable for tests; defaults to the global EventSource. */
  EventSourceImpl?: typeof EventSource;
}

export interface StaffStream {
  /** True between construction/reconnect and the first message received. */
  isStale(): boolean;
  /** Bypasses the browser's own pending retry delay - screen 3.3's "Retry Now". */
  reconnect(): void;
  close(): void;
}

export function connectStaffStream(options: StaffStreamOptions): StaffStream {
  const {
    baseUrl,
    deviceToken,
    eventNames,
    onEvent,
    onStaleChange,
    staleAfterMs = 10_000,
    EventSourceImpl = EventSource,
  } = options;

  let lastEventId = options.lastEventId ?? null;
  let source: EventSource | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let lastMessageAt = 0;
  let stale = true; // no message received yet - genuinely unknown, treated as stale

  function buildUrl(): string {
    const url = new URL('/staff/stream', baseUrl);
    url.searchParams.set('deviceToken', deviceToken);
    if (lastEventId) url.searchParams.set('lastEventId', lastEventId);
    return url.toString();
  }

  function setStale(next: boolean): void {
    if (stale === next) return;
    stale = next;
    onStaleChange(next);
  }

  function markAlive(): void {
    lastMessageAt = Date.now();
    setStale(false);
  }

  function checkWatchdog(): void {
    if (Date.now() - lastMessageAt >= staleAfterMs) setStale(true);
  }

  function attach(): void {
    const es = new EventSourceImpl(buildUrl());
    es.onerror = () => setStale(true); // a detected failure is stronger than "just old"
    for (const name of eventNames) {
      es.addEventListener(name, (event) => {
        const messageEvent = event as MessageEvent<string>;
        if (messageEvent.lastEventId) lastEventId = messageEvent.lastEventId;
        markAlive();
        onEvent({
          id: messageEvent.lastEventId || null,
          event: name,
          data: JSON.parse(messageEvent.data) as unknown,
        });
      });
    }
    source = es;
  }

  attach();
  watchdog = setInterval(checkWatchdog, 1_000);

  return {
    isStale: () => stale,
    reconnect: () => {
      source?.close();
      attach();
    },
    close: () => {
      source?.close();
      source = null;
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
    },
  };
}
