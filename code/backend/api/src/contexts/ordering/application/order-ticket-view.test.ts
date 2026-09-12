import { describe, expect, it } from 'vitest';
import { buildOrderTicket, type OrderTicketSource } from './order-ticket-view.js';

function source(overrides: Partial<OrderTicketSource> = {}): OrderTicketSource {
  return {
    orderId: 'o1',
    orderNumber: 'A-047',
    channel: 'whatsapp',
    status: 'received',
    tableLabel: null,
    customerNote: 'Pack sauces separately.',
    placedAt: new Date('2026-09-06T12:00:00.000Z'),
    acceptedAt: new Date('2026-09-06T12:01:00.000Z'),
    promisedEtaUpperAt: new Date('2026-09-06T12:15:00.000Z'),
    customer: { displayName: 'Marcus Aziz', tier: 'bronze' },
    items: [
      {
        orderItemId: 'oi1',
        qty: 2,
        nameSnapshotEn: 'Crispy Chicken Sando',
        nameSnapshotAr: null,
        modifiers: [{ nameSnapshotEn: 'Extra Spicy', nameSnapshotAr: null }],
        ticked: false,
      },
    ],
    lastStaffTransitionAt: new Date('2026-09-06T12:01:00.000Z'),
    ...overrides,
  };
}

describe('buildOrderTicket', () => {
  it('derives the customer first name from the full display name', () => {
    const ticket = buildOrderTicket(source(), new Date('2026-09-06T12:05:00.000Z'));
    expect(ticket.customerFirstName).toBe('Marcus');
  });

  it('is null for an anonymous till order', () => {
    const ticket = buildOrderTicket(
      source({ customer: null, channel: 'cashier', tableLabel: 'Counter 2' }),
      new Date('2026-09-06T12:05:00.000Z'),
    );
    expect(ticket.customerFirstName).toBeNull();
    expect(ticket.tableLabel).toBe('Counter 2');
  });

  it('marks gold-tier customers as priority (docs/01 §4.5 perk)', () => {
    const ticket = buildOrderTicket(
      source({ customer: { displayName: 'Sophia', tier: 'gold' } }),
      new Date('2026-09-06T12:05:00.000Z'),
    );
    expect(ticket.isPriority).toBe(true);
  });

  it('always reports fulfillment as pickup (DEC-01)', () => {
    expect(buildOrderTicket(source(), new Date('2026-09-06T12:05:00.000Z')).fulfillment).toBe(
      'pickup',
    );
  });

  it('computes ageSeconds from placedAt, never negative', () => {
    const ticket = buildOrderTicket(source(), new Date('2026-09-06T12:00:30.000Z'));
    expect(ticket.ageSeconds).toBe(30);
  });

  it('shows a revert window within 60s of the last staff transition', () => {
    const ticket = buildOrderTicket(
      source({ lastStaffTransitionAt: new Date('2026-09-06T12:01:00.000Z') }),
      new Date('2026-09-06T12:01:30.000Z'),
    );
    expect(ticket.revertWindow).toEqual({ revertibleUntil: '2026-09-06T12:02:00.000Z' });
  });

  it('hides the revert window past 60s (FR-3.7)', () => {
    const ticket = buildOrderTicket(
      source({ lastStaffTransitionAt: new Date('2026-09-06T12:01:00.000Z') }),
      new Date('2026-09-06T12:02:01.000Z'),
    );
    expect(ticket.revertWindow).toBeNull();
  });

  it('has no revert window when no staff transition produced the current status', () => {
    const ticket = buildOrderTicket(
      source({
        lastStaffTransitionAt: null,
        status: 'placed',
        acceptedAt: null,
        promisedEtaUpperAt: null,
      }),
      new Date('2026-09-06T12:00:30.000Z'),
    );
    expect(ticket.revertWindow).toBeNull();
  });

  it('carries the modifier and allergen-note shape without inventing allergen data', () => {
    const ticket = buildOrderTicket(source(), new Date('2026-09-06T12:05:00.000Z'));
    expect(ticket.items[0]).toMatchObject({
      qty: 2,
      nameSnapshot: { en: 'Crispy Chicken Sando' },
      modifiers: [{ nameSnapshot: { en: 'Extra Spicy' }, isAllergenFlag: false }],
      allergenNote: null,
      ticked: false,
    });
  });

  it('always reports syncState confirmed - provisional/pending_local are client-only (ADR-0022)', () => {
    expect(buildOrderTicket(source(), new Date('2026-09-06T12:05:00.000Z')).syncState).toBe(
      'confirmed',
    );
  });
});
