import { LOCALES, translate, type MessageKey } from '@veyroxai/i18n';
import { previewPoints, toMinor, type LoyaltyTier } from '@veyroxai/domain';
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
    lowerMinutes: number | null;
    upperMinutes: number | null;
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
function minutesUntil(target: Date | null, now: Date): number | null {
  if (!target) return null;
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000));
}

export function describeOrderStatus(
  row: OwnedOrderRow,
  input: { tier: LoyaltyTier; now: Date },
): OrderStatusView {
  const key = `order.status.${row.status}` as MessageKey;
  const statusLabel = Object.fromEntries(LOCALES.map((locale) => [locale, translate(locale, key)]));

  const clockRunning = ETA_STARTED.has(row.status) && row.promisedEtaUpperAt !== null;
  const eta = clockRunning
    ? {
        lowerMinutes: minutesUntil(row.promisedEtaLowerAt, input.now),
        upperMinutes: minutesUntil(row.promisedEtaUpperAt, input.now),
        startsOnAccept: false,
        promisedLowerAt: row.promisedEtaLowerAt?.toISOString() ?? null,
        promisedUpperAt: row.promisedEtaUpperAt?.toISOString() ?? null,
      }
    : {
        lowerMinutes: null,
        upperMinutes: null,
        startsOnAccept: row.status === 'placed',
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
