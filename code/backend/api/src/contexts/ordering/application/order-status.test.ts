import { describe, expect, it } from 'vitest';
import { describeOrderStatus } from './order-status.js';
import type { OwnedOrderRow } from '../infrastructure/order-status-repository.js';

function row(overrides: Partial<OwnedOrderRow> = {}): OwnedOrderRow {
  return {
    orderId: 'o1',
    orderNumber: 'A-047',
    status: 'placed',
    totalMinor: 27500,
    promisedEtaLowerAt: null,
    promisedEtaUpperAt: null,
    placedAt: new Date('2026-09-07T12:00:00Z'),
    acceptedAt: null,
    readyAt: null,
    collectedAt: null,
    rejectionReason: null,
    rejectedAt: null,
    etaItems: [{ prepSeconds: 120 }],
    ...overrides,
  };
}

const now = new Date('2026-09-07T12:05:00Z');
// An empty queue, one station — so the pre-Accept estimate comes only from the
// order's own prep time, same as the PlaceOrder tests.
const queue = { tickets: [], activeStations: 1 };
const input = (overrides: { tier: 'bronze' | 'gold' }) => ({
  ...overrides,
  now,
  queue,
  upperMultiplier: 1.25,
});

describe('describeOrderStatus', () => {
  it('labels a placed order in both locales with a live pre-Accept estimate', () => {
    const view = describeOrderStatus(row(), input({ tier: 'bronze' }));
    expect(view.statusLabel).toEqual({
      en: 'Sent to the kitchen',
      'ar-EG': 'تم الإرسال للمطبخ',
    });
    // F1.7 §2's own worked example: a populated range before Accept, not a blank
    // promise — only promisedLowerAt/UpperAt wait on Accept.
    expect(view.eta).toEqual({
      startsOnAccept: true,
      lowerMinutes: 5,
      upperMinutes: 10,
      promisedLowerAt: null,
      promisedUpperAt: null,
    });
  });

  it('collapses received and preparing to the same customer label', () => {
    const received = describeOrderStatus(row({ status: 'received' }), input({ tier: 'bronze' }));
    const preparing = describeOrderStatus(row({ status: 'preparing' }), input({ tier: 'bronze' }));
    expect(received.statusLabel.en).toBe('Being prepared');
    expect(preparing.statusLabel.en).toBe('Being prepared');
  });

  it('counts down from the promised times once accepted', () => {
    const view = describeOrderStatus(
      row({
        status: 'received',
        promisedEtaLowerAt: new Date('2026-09-07T12:11:00Z'),
        promisedEtaUpperAt: new Date('2026-09-07T12:15:00Z'),
      }),
      input({ tier: 'bronze' }),
    );
    expect(view.eta.lowerMinutes).toBe(6);
    expect(view.eta.upperMinutes).toBe(10);
    expect(view.eta.startsOnAccept).toBe(false);
    expect(view.eta.promisedUpperAt).toBe('2026-09-07T12:15:00.000Z');
  });

  it('floors an elapsed promise at zero rather than showing negative minutes', () => {
    const view = describeOrderStatus(
      row({
        status: 'preparing',
        promisedEtaLowerAt: new Date('2026-09-07T12:01:00Z'),
        promisedEtaUpperAt: new Date('2026-09-07T12:03:00Z'),
      }),
      input({ tier: 'bronze' }),
    );
    expect(view.eta.lowerMinutes).toBe(0);
    expect(view.eta.upperMinutes).toBe(0);
  });

  it('still returns a populated estimate when an accepted order is missing its promise', () => {
    // Defensive: this shouldn't happen once Accept always writes both columns, but
    // a blank eta would fail the contract just as badly as it did pre-Accept.
    const view = describeOrderStatus(row({ status: 'received' }), input({ tier: 'bronze' }));
    expect(view.eta.lowerMinutes).toBeGreaterThan(0);
    expect(view.eta.upperMinutes).toBeGreaterThan(0);
  });

  it('passes through a known rejection reason and drops an unknown one', () => {
    expect(
      describeOrderStatus(
        row({ status: 'rejected', rejectionReason: 'item_unavailable' }),
        input({ tier: 'bronze' }),
      ).rejectionReason,
    ).toBe('item_unavailable');
    expect(
      describeOrderStatus(
        row({ status: 'rejected', rejectionReason: 'staff typed something' }),
        input({ tier: 'bronze' }),
      ).rejectionReason,
    ).toBeNull();
  });

  it('previews loyalty points against the order total and the token tier', () => {
    expect(describeOrderStatus(row(), input({ tier: 'gold' })).loyalty.pointsToEarn).toBe(
      Math.floor(27 * 1.5),
    );
  });
});
