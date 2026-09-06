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
    ...overrides,
  };
}

const now = new Date('2026-09-07T12:05:00Z');

describe('describeOrderStatus', () => {
  it('labels a placed order in both locales without starting the clock', () => {
    const view = describeOrderStatus(row(), { tier: 'bronze', now });
    expect(view.statusLabel).toEqual({
      en: 'Sent to the kitchen',
      'ar-EG': 'تم الإرسال للمطبخ',
    });
    expect(view.eta).toMatchObject({
      startsOnAccept: true,
      lowerMinutes: null,
      upperMinutes: null,
    });
  });

  it('collapses received and preparing to the same customer label', () => {
    const received = describeOrderStatus(row({ status: 'received' }), { tier: 'bronze', now });
    const preparing = describeOrderStatus(row({ status: 'preparing' }), { tier: 'bronze', now });
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
      { tier: 'bronze', now },
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
      { tier: 'bronze', now },
    );
    expect(view.eta.lowerMinutes).toBe(0);
    expect(view.eta.upperMinutes).toBe(0);
  });

  it('passes through a known rejection reason and drops an unknown one', () => {
    expect(
      describeOrderStatus(row({ status: 'rejected', rejectionReason: 'item_unavailable' }), {
        tier: 'bronze',
        now,
      }).rejectionReason,
    ).toBe('item_unavailable');
    expect(
      describeOrderStatus(row({ status: 'rejected', rejectionReason: 'staff typed something' }), {
        tier: 'bronze',
        now,
      }).rejectionReason,
    ).toBeNull();
  });

  it('previews loyalty points against the order total and the token tier', () => {
    expect(describeOrderStatus(row(), { tier: 'gold', now }).loyalty.pointsToEarn).toBe(
      Math.floor(27 * 1.5),
    );
  });
});
