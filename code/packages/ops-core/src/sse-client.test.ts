import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectStaffStream } from './sse-client.js';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown, lastEventId = ''): void {
    const event = { data: JSON.stringify(data), lastEventId } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  triggerError(): void {
    this.onerror?.();
  }
}

function subject(overrides?: Partial<Parameters<typeof connectStaffStream>[0]>) {
  const onEvent = vi.fn();
  const onStaleChange = vi.fn();
  const stream = connectStaffStream({
    baseUrl: 'https://api.test',
    deviceToken: 'dt',
    eventNames: ['order.transitioned', 'heartbeat'],
    onEvent,
    onStaleChange,
    EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
    ...overrides,
  });
  const source = FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
  return { stream, source, onEvent, onStaleChange };
}

describe('connectStaffStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds the URL with deviceToken and, when given, lastEventId', () => {
    const { source } = subject({ lastEventId: 'e5' });
    const url = new URL(source.url);
    expect(url.pathname).toBe('/staff/stream');
    expect(url.searchParams.get('deviceToken')).toBe('dt');
    expect(url.searchParams.get('lastEventId')).toBe('e5');
  });

  it('omits lastEventId on a genuinely first connection', () => {
    const { source } = subject();
    expect(new URL(source.url).searchParams.has('lastEventId')).toBe(false);
  });

  it('starts stale (no message received yet) and clears on the first message', () => {
    const { stream, source, onStaleChange } = subject();
    expect(stream.isStale()).toBe(true);

    source.emit('order.transitioned', { orderId: 'o1' }, 'e1');

    expect(stream.isStale()).toBe(false);
    expect(onStaleChange).toHaveBeenCalledTimes(1);
    expect(onStaleChange).toHaveBeenCalledWith(false);
  });

  it('parses a frame with its event name, data, and id', () => {
    const { source, onEvent } = subject();
    source.emit('order.transitioned', { orderId: 'o1', status: 'received' }, 'e7');

    expect(onEvent).toHaveBeenCalledWith({
      id: 'e7',
      event: 'order.transitioned',
      data: { orderId: 'o1', status: 'received' },
    });
  });

  it('a heartbeat with no id resolves as id: null', () => {
    const { source, onEvent } = subject();
    source.emit('heartbeat', {});
    expect(onEvent).toHaveBeenCalledWith({ id: null, event: 'heartbeat', data: {} });
  });

  it('goes stale after staleAfterMs with no message (FR-3.6)', () => {
    const { stream, source, onStaleChange } = subject({ staleAfterMs: 10_000 });
    source.emit('heartbeat', {}); // alive once, then silence
    onStaleChange.mockClear();

    vi.advanceTimersByTime(9_999);
    expect(stream.isStale()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(stream.isStale()).toBe(true);
    expect(onStaleChange).toHaveBeenCalledTimes(1);
    expect(onStaleChange).toHaveBeenCalledWith(true);
  });

  it('does not re-fire onStaleChange for a state it is already in', () => {
    const { source, onStaleChange } = subject({ staleAfterMs: 10_000 });
    source.emit('heartbeat', {}); // alive
    onStaleChange.mockClear();

    vi.advanceTimersByTime(30_000); // one crossing, then two more watchdog ticks past it
    expect(onStaleChange).toHaveBeenCalledTimes(1); // the one true transition only

    source.emit('heartbeat', {});
    source.emit('heartbeat', {}); // second alive message - already not-stale
    expect(onStaleChange).toHaveBeenCalledTimes(2); // the one false transition only
  });

  it('a detected connection error marks stale immediately, before the watchdog would', () => {
    const { stream, source } = subject({ staleAfterMs: 10_000 });
    source.emit('heartbeat', {});
    expect(stream.isStale()).toBe(false);

    source.triggerError();
    expect(stream.isStale()).toBe(true);
  });

  it('reconnect() closes the current source and opens a fresh one', () => {
    const { stream, source } = subject();
    stream.reconnect();

    expect(source.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1]!.closed).toBe(false);
  });

  it('close() closes the source and stops the watchdog', () => {
    const { stream, source, onStaleChange } = subject({ staleAfterMs: 10_000 });
    source.emit('heartbeat', {});
    stream.close();
    onStaleChange.mockClear();

    vi.advanceTimersByTime(60_000);

    expect(source.closed).toBe(true);
    expect(onStaleChange).not.toHaveBeenCalled();
  });
});
