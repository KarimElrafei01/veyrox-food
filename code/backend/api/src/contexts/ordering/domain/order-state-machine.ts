// docs/01-system-design.md §4.3: "Rules, enforced in domain/orderStateMachine.ts
// and asserted in the DB by a trigger." Transitions are total and explicit;
// anything unlisted throws. Revert (FR-3.7) is deliberately NOT modeled here —
// its legal target is whatever order_events.from_status the last transition
// recorded, not a fixed pair, so it is resolved dynamically against the event
// log rather than this static table.
export type OrderStatus =
  | 'draft'
  | 'placed'
  | 'pending'
  | 'received'
  | 'preparing'
  | 'ready'
  | 'collected'
  | 'voided'
  | 'abandoned'
  | 'rejected';

/** WhatsApp `placed`, Till `pending` — both land in New (FR-3.1/FR-3.11) and share
 *  one Accept/Reject gate regardless of which channel produced them. */
export const NEW_TICKET_STATUSES = ['placed', 'pending'] as const;

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['pending'],
  placed: ['received', 'rejected'],
  pending: ['received', 'rejected'],
  received: ['preparing', 'voided'],
  preparing: ['ready', 'voided', 'abandoned'],
  ready: ['collected', 'voided', 'abandoned'],
  collected: [],
  voided: [],
  abandoned: [],
  rejected: [],
};

export function legalNextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isNewTicket(status: OrderStatus): boolean {
  return (NEW_TICKET_STATUSES as readonly string[]).includes(status);
}

/** FR-3.7's undo can only ever be a pure status rollback, never a financial one -
 *  so it must never reach a status whose own transition already moved money or
 *  materials for real: `voided` (ledger negation + manager PIN), `abandoned`
 *  (waste, no return), `collected` (payment + loyalty accrual). Those have their
 *  own dedicated reversal paths (void); a generic revert must not shortcut them.
 *  `received`/`preparing`/`ready`/`rejected` are safe: accept's own ledger write
 *  is deliberately NOT undone by reverting out of `received` (INV-7/FR-3.7 - "the
 *  reversal is logged, but ready messages already sent are not un-sent" and,
 *  identically, materials already deducted are not un-deducted). */
const REVERT_ELIGIBLE_STATUSES = ['received', 'preparing', 'ready', 'rejected'] as const;

export function isRevertEligible(status: OrderStatus): boolean {
  return (REVERT_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}
