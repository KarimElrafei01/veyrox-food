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
