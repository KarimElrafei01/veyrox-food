import { describe, expect, it } from 'vitest';
import { ageBand, REVERT_WINDOW_SECONDS } from './ticket-age.js';

describe('ageBand', () => {
  const placedAt = new Date('2026-09-06T12:00:00.000Z');

  it('is green for a fresh New ticket', () => {
    const now = new Date(placedAt.getTime() + 60_000);
    expect(
      ageBand({ status: 'placed', placedAt, acceptedAt: null, promisedEtaUpperAt: null }, now),
    ).toBe('green');
  });

  it('turns amber past 2 minutes unaccepted (FR-3.13)', () => {
    const now = new Date(placedAt.getTime() + 121_000);
    expect(
      ageBand({ status: 'pending', placedAt, acceptedAt: null, promisedEtaUpperAt: null }, now),
    ).toBe('amber');
  });

  it('turns red past 3 minutes unaccepted (1.5x the 2-minute threshold)', () => {
    const now = new Date(placedAt.getTime() + 181_000);
    expect(
      ageBand({ status: 'placed', placedAt, acceptedAt: null, promisedEtaUpperAt: null }, now),
    ).toBe('red');
  });

  it('is green for an accepted ticket still inside its promised ETA', () => {
    const acceptedAt = new Date('2026-09-06T12:05:00.000Z');
    const promisedEtaUpperAt = new Date('2026-09-06T12:15:00.000Z');
    const now = new Date('2026-09-06T12:10:00.000Z');
    expect(ageBand({ status: 'preparing', placedAt, acceptedAt, promisedEtaUpperAt }, now)).toBe(
      'green',
    );
  });

  it('turns amber the instant now passes the promised upper bound (FR-3.8)', () => {
    const acceptedAt = new Date('2026-09-06T12:05:00.000Z');
    const promisedEtaUpperAt = new Date('2026-09-06T12:15:00.000Z');
    const now = new Date(promisedEtaUpperAt.getTime() + 1000);
    expect(ageBand({ status: 'preparing', placedAt, acceptedAt, promisedEtaUpperAt }, now)).toBe(
      'amber',
    );
  });

  it('turns red past 1.5x the accept-to-promised-upper duration', () => {
    // 10-minute prep window (12:05 -> 12:15): red starts at 12:05 + 15min = 12:20.
    const acceptedAt = new Date('2026-09-06T12:05:00.000Z');
    const promisedEtaUpperAt = new Date('2026-09-06T12:15:00.000Z');
    const now = new Date('2026-09-06T12:20:01.000Z');
    expect(ageBand({ status: 'preparing', placedAt, acceptedAt, promisedEtaUpperAt }, now)).toBe(
      'red',
    );
  });

  it('is independent of column — a Preparing ticket can already be red', () => {
    const acceptedAt = new Date('2026-09-06T12:00:00.000Z');
    const promisedEtaUpperAt = new Date('2026-09-06T12:05:00.000Z');
    const now = new Date('2026-09-06T12:20:00.000Z');
    expect(ageBand({ status: 'preparing', placedAt, acceptedAt, promisedEtaUpperAt }, now)).toBe(
      'red',
    );
  });
});

describe('REVERT_WINDOW_SECONDS', () => {
  it('is the 60-second undo window from FR-3.7', () => {
    expect(REVERT_WINDOW_SECONDS).toBe(60);
  });
});
