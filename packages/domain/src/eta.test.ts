import { describe, expect, it } from 'vitest';
import { estimateEta } from './eta.js';

const now = new Date('2026-09-06T12:00:00.000Z');

describe('estimateEta', () => {
  it('uses an asymmetric range, clamps stations, and decays preparing tickets', () => {
    const eta = estimateEta(
      [{ prepSeconds: 150 }],
      [
        {
          prepSeconds: 150,
          status: 'preparing',
          startedAt: new Date('2026-09-06T11:59:00.000Z'),
          tier: 'bronze',
        },
      ],
      'bronze',
      0,
      now,
    );
    expect(eta).toEqual({ lowerMinutes: 5, upperMinutes: 5, queueDepth: 1 });
  });

  it('does not make Gold wait behind lower-tier tickets', () => {
    const eta = estimateEta(
      [{ prepSeconds: 60 }],
      [{ prepSeconds: 900, status: 'received', startedAt: null, tier: 'bronze' }],
      'gold',
      1,
      now,
    );
    expect(eta).toEqual({ lowerMinutes: 5, upperMinutes: 5, queueDepth: 0 });
  });

  it('caps large-cart preparation at fifteen minutes', () => {
    const eta = estimateEta([{ prepSeconds: 900 }, { prepSeconds: 900 }], [], null, 1, now);
    expect(eta).toEqual({ lowerMinutes: 15, upperMinutes: 20, queueDepth: 0 });
  });
});
