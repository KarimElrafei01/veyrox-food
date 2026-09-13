import type { RejectOrderRequest } from '@veyroxai/contracts';

/** The exact FR-3.12 enum - a reason chip *is* the confirmation (§2.2), so
 *  this list is the only decision this screen's Reject flow makes. */
export const REJECT_REASONS: readonly RejectOrderRequest['reasonCode'][] = [
  'too_busy',
  'item_unavailable',
  'closing',
];
