import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { isRevertEligible, legalNextStatuses, type OrderStatus } from './order-state-machine.js';

// docs/features/F2-kitchen-display-system/backend-implementation.md §9: "for any
// sequence of accept -> advance* -> revert? -> advance* interleavings, INV-1/
// INV-2/INV-7 continue to hold". The ledger writes themselves (accept's
// sale_deduction rows, void's exact negation) live in the repository, outside
// the domain layer's purity rule (no I/O) - what this pure state-machine test
// can and must guarantee is the boundary those writes depend on: revert is
// never legal from a status whose own forward transition already moved money
// or materials for real. If a future edit to the transition table ever made
// revert reachable from `voided`/`abandoned`/`collected`, this is the test
// that catches it before a barista's undo tap corrupts the ledger.
const LEDGER_TERMINAL_STATUSES: readonly OrderStatus[] = ['voided', 'abandoned', 'collected'];
const REVERT_ELIGIBLE_STATUSES: readonly OrderStatus[] = [
  'received',
  'preparing',
  'ready',
  'rejected',
];

test.prop([
  fc.constantFrom<OrderStatus>('placed', 'pending'),
  fc.array(fc.nat({ max: 10 }), { minLength: 1, maxLength: 30 }),
])(
  'revert is never legal once a transition has moved money or materials for real',
  (start, choices) => {
    let current: OrderStatus = start;
    for (const choice of choices) {
      const next = legalNextStatuses(current);
      if (next.length === 0) break; // terminal status - the walk stops here
      current = next[choice % next.length]!;

      if (LEDGER_TERMINAL_STATUSES.includes(current)) {
        expect(isRevertEligible(current)).toBe(false);
      } else {
        expect(isRevertEligible(current)).toBe(REVERT_ELIGIBLE_STATUSES.includes(current));
      }
    }
  },
);
