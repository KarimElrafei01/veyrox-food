import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSseEvent, SseHub } from './sse-hub.js';

describe('formatSseEvent', () => {
  it('formats id/event/data per the SSE wire format', () => {
    expect(formatSseEvent({ id: 'e1', event: 'order.transitioned', data: { a: 1 } })).toBe(
      'id: e1\nevent: order.transitioned\ndata: {"a":1}\n\n',
    );
  });

  it('omits the id line for an event with no order_events row (kitchen_state.changed)', () => {
    expect(formatSseEvent({ event: 'kitchen_state.changed', data: { activeStations: 3 } })).toBe(
      'event: kitchen_state.changed\ndata: {"activeStations":3}\n\n',
    );
  });
});

describe('SseHub', () => {
  let hub: SseHub;
  afterEach(() => hub.stop());

  it('publishes only to subscribers of the matching tenant', () => {
    hub = new SseHub();
    const tenantAWrites: string[] = [];
    const tenantBWrites: string[] = [];
    hub.subscribe('tenant-a', { write: (chunk) => tenantAWrites.push(chunk) });
    hub.subscribe('tenant-b', { write: (chunk) => tenantBWrites.push(chunk) });

    hub.publish('tenant-a', { id: 'e1', event: 'order.transitioned', data: {} });

    expect(tenantAWrites).toHaveLength(1);
    expect(tenantBWrites).toHaveLength(0);
  });

  it('fans out to every subscriber of the same tenant', () => {
    hub = new SseHub();
    const writes: string[][] = [[], []];
    hub.subscribe('tenant-a', { write: (chunk) => writes[0]?.push(chunk) });
    hub.subscribe('tenant-a', { write: (chunk) => writes[1]?.push(chunk) });

    hub.publish('tenant-a', { id: 'e1', event: 'order.transitioned', data: {} });

    expect(writes[0]).toHaveLength(1);
    expect(writes[1]).toHaveLength(1);
  });

  it('stops delivering to an unsubscribed connection', () => {
    hub = new SseHub();
    const writes: string[] = [];
    const unsubscribe = hub.subscribe('tenant-a', { write: (chunk) => writes.push(chunk) });
    unsubscribe();

    hub.publish('tenant-a', { id: 'e1', event: 'order.transitioned', data: {} });

    expect(writes).toHaveLength(0);
    expect(hub.subscriberCount('tenant-a')).toBe(0);
  });

  it('never throws publishing to a tenant with no connected subscribers', () => {
    hub = new SseHub();
    expect(() =>
      hub.publish('tenant-with-nobody-connected', {
        id: 'e1',
        event: 'order.transitioned',
        data: {},
      }),
    ).not.toThrow();
  });

  it('sends a named heartbeat event every 20s to every open connection (ADR-0005, amended)', () => {
    vi.useFakeTimers();
    try {
      hub = new SseHub();
      const writes: string[] = [];
      hub.subscribe('tenant-a', { write: (chunk) => writes.push(chunk) });

      vi.advanceTimersByTime(20_000);

      // A named event, not a bare comment - EventSource.addEventListener can't
      // see a comment, and the frontend staleness watchdog needs to see this.
      expect(writes).toEqual(['event: heartbeat\ndata: {}\n\n']);
    } finally {
      vi.useRealTimers();
    }
  });
});
