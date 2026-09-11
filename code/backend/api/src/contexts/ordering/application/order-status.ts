import { LOCALES, translate, type MessageKey } from '@veyroxai/i18n';
import {
  estimateEta,
  previewPoints,
  toMinor,
  type LoyaltyTier,
  type QueueTicket,
} from '@veyroxai/domain';
import type { OwnedOrderRow } from '../infrastructure/order-status-repository.js';

export class OrderNotFound extends Error {
  constructor() {
    super('No such order for this customer.');
    this.name = 'OrderNotFound';
  }
}

const REJECTION_REASONS = ['too_busy', 'item_unavailable', 'closing'] as const;
type RejectionReason = (typeof REJECTION_REASONS)[number];

const ETA_STARTED = new Set(['received', 'preparing', 'ready']);

export interface OrderStatusView {
  orderId: string;
  orderNumber: string;
  status: string;
  statusLabel: Record<string, string>;
  totalMinor: number;
  payAt: 'counter';
  eta: {
    lowerMinutes: number;
    upperMinutes: number;
    startsOnAccept: boolean;
    promisedLowerAt: string | null;
    promisedUpperAt: string | null;
  };
  loyalty: { pointsToEarn: number };
  placedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  rejectionReason: RejectionReason | null;
  rejectedAt: string | null;
}

/** Minutes from now until `target`, never negative — a promise already past reads
 *  as "0 min", not "-2 min" (F1.7 §7 unit test). */
function minutesUntil(target: Date, now: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000));
}

export function describeOrderStatus(
  row: OwnedOrderRow,
  input: {
    tier: LoyaltyTier;
    now: Date;
    queue: { tickets: readonly QueueTicket[]; activeStations: number };
    upperMultiplier: number;
  },
): OrderStatusView {
  const key = `order.status.${row.status}` as MessageKey;
  const statusLabel = Object.fromEntries(LOCALES.map((locale) => [locale, translate(locale, key)]));

  const clockRunning =
    ETA_STARTED.has(row.status) &&
    row.promisedEtaLowerAt !== null &&
    row.promisedEtaUpperAt !== null;
  // F1.7 §2's own "placed, awaiting Accept" example: a populated range ("~8-12 min
  // once the kitchen accepts"), never a blank promise — only the wall-clock fields
  // wait on Accept. Same estimator and live queue snapshot the quote/placement
  // endpoints use, so re-opening the webview before a barista taps Accept shows
  // the same number, not nothing.
  const estimate = estimateEta(
    row.etaItems,
    input.queue.tickets,
    input.tier,
    input.queue.activeStations,
    input.now,
    input.upperMultiplier,
  );
  // `clockRunning` already proved both are non-null; TS can't correlate that through
  // a boolean, hence the assertions.
  const eta = clockRunning
    ? {
        lowerMinutes: minutesUntil(row.promisedEtaLowerAt!, input.now),
        upperMinutes: minutesUntil(row.promisedEtaUpperAt!, input.now),
        startsOnAccept: false,
        promisedLowerAt: row.promisedEtaLowerAt!.toISOString(),
        promisedUpperAt: row.promisedEtaUpperAt!.toISOString(),
      }
    : {
        lowerMinutes: estimate.lowerMinutes,
        upperMinutes: estimate.upperMinutes,
        startsOnAccept: true,
        promisedLowerAt: null,
        promisedUpperAt: null,
      };

  const rejectionReason = REJECTION_REASONS.includes(row.rejectionReason as RejectionReason)
    ? (row.rejectionReason as RejectionReason)
    : null;

  return {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    status: row.status,
    statusLabel,
    totalMinor: row.totalMinor,
    payAt: 'counter',
    eta,
    loyalty: { pointsToEarn: previewPoints(toMinor(row.totalMinor), input.tier).pointsToEarn },
    placedAt: row.placedAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    collectedAt: row.collectedAt?.toISOString() ?? null,
    rejectionReason,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
  };
}
