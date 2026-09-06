import { describe, expect, it } from 'vitest';
import { isStoreOpen } from './store-hours.js';

describe('isStoreOpen', () => {
  const hours = [{ weekday: 0, opens: '20:00', closes: '02:00', crossesMidnight: true }];
  it('handles overnight schedules and closures', () => {
    expect(isStoreOpen(hours, [], new Date('2026-09-06T18:00:00Z'), 'Africa/Cairo')).toBe(true);
    expect(isStoreOpen(hours, [], new Date('2026-09-06T22:00:00Z'), 'Africa/Cairo')).toBe(true);
    expect(isStoreOpen(hours, [], new Date('2026-09-07T00:00:00Z'), 'Africa/Cairo')).toBe(false);
    expect(
      isStoreOpen(
        hours,
        [{ startsAt: new Date('2026-09-06T17:30:00Z'), endsAt: new Date('2026-09-06T19:00:00Z') }],
        new Date('2026-09-06T18:00:00Z'),
        'Africa/Cairo',
      ),
    ).toBe(false);
  });
});
