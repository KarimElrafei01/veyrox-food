import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isNewTicket,
  isRevertEligible,
  legalNextStatuses,
} from './order-state-machine.js';

describe('order state machine', () => {
  it('lets both channels converge on accept (01-system-design.md §4.3)', () => {
    expect(canTransition('placed', 'received')).toBe(true);
    expect(canTransition('pending', 'received')).toBe(true);
  });

  it('lets both New statuses be rejected, never accepted-then-rejected', () => {
    expect(canTransition('placed', 'rejected')).toBe(true);
    expect(canTransition('pending', 'rejected')).toBe(true);
    expect(canTransition('received', 'rejected')).toBe(false);
  });

  it('only allows void from received, preparing, or ready', () => {
    expect(canTransition('received', 'voided')).toBe(true);
    expect(canTransition('preparing', 'voided')).toBe(true);
    expect(canTransition('ready', 'voided')).toBe(true);
    expect(canTransition('placed', 'voided')).toBe(false);
  });

  it('has no outgoing transitions from any terminal status', () => {
    for (const terminal of ['collected', 'voided', 'abandoned', 'rejected'] as const) {
      expect(legalNextStatuses(terminal)).toEqual([]);
    }
  });

  it('identifies New-column statuses (FR-3.1/FR-3.11)', () => {
    expect(isNewTicket('placed')).toBe(true);
    expect(isNewTicket('pending')).toBe(true);
    expect(isNewTicket('received')).toBe(false);
  });

  it('never allows revert to reach a status that already moved money or materials for real', () => {
    for (const status of ['voided', 'abandoned', 'collected'] as const) {
      expect(isRevertEligible(status)).toBe(false);
    }
  });

  it('allows revert for every pure status transition accept/advance/reject produce', () => {
    for (const status of ['received', 'preparing', 'ready', 'rejected'] as const) {
      expect(isRevertEligible(status)).toBe(true);
    }
  });
});
