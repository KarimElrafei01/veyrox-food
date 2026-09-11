import type { QuoteResponse } from '@veyroxai/contracts';
import type { CartLine } from './cart-store.js';

const SNAPSHOT_KEY_PREFIX = 'vx.placed-order.';
const MAX_LINES = 32;
const MAX_TEXT_LENGTH = 180;

export interface PlacedOrderSnapshot {
  lines: Array<{
    qty: number;
    nameEn: string;
    nameAr?: string;
    modifierSummary?: string;
    imageUrl?: string | null;
    lineTotalMinor: number;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  pointsToEarn: number;
}

export function createPlacedOrderSnapshot(
  lines: CartLine[],
  quote: QuoteResponse,
): PlacedOrderSnapshot {
  const quotedByLine = new Map(quote.lines.map((line) => [line.clientLineId, line]));
  return {
    lines: lines.map((line) => ({
      qty: line.qty,
      nameEn: line.nameEn,
      nameAr: line.nameAr,
      modifierSummary: line.modifierSummary,
      imageUrl: line.imageUrl,
      lineTotalMinor: quotedByLine.get(line.lineId)?.lineTotalMinor ?? 0,
    })),
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    totalMinor: quote.totalMinor,
    pointsToEarn: quote.loyalty.pointsToEarn,
  };
}

export function savePlacedOrderSnapshot(orderId: string, snapshot: PlacedOrderSnapshot): void {
  try {
    sessionStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${orderId}`, JSON.stringify(snapshot));
  } catch {
    // A restricted webview can still show its live status; order details are optional UI.
  }
}

export function readPlacedOrderSnapshot(orderId: string): PlacedOrderSnapshot | null {
  try {
    const raw = sessionStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${orderId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isPlacedOrderSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlacedOrderSnapshot(value: unknown): value is PlacedOrderSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snapshot = value as Record<string, unknown>;
  return (
    Array.isArray(snapshot.lines) &&
    snapshot.lines.length <= MAX_LINES &&
    snapshot.lines.every(isPlacedOrderLine) &&
    isMinor(snapshot.subtotalMinor) &&
    isMinor(snapshot.discountMinor) &&
    isMinor(snapshot.totalMinor) &&
    isMinor(snapshot.pointsToEarn)
  );
}

function isPlacedOrderLine(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const line = value as Record<string, unknown>;
  return (
    Number.isInteger(line.qty) &&
    typeof line.nameEn === 'string' &&
    line.nameEn.length <= MAX_TEXT_LENGTH &&
    (line.nameAr === undefined ||
      (typeof line.nameAr === 'string' && line.nameAr.length <= MAX_TEXT_LENGTH)) &&
    (line.modifierSummary === undefined ||
      (typeof line.modifierSummary === 'string' &&
        line.modifierSummary.length <= MAX_TEXT_LENGTH)) &&
    (line.imageUrl === undefined || line.imageUrl === null || typeof line.imageUrl === 'string') &&
    isMinor(line.lineTotalMinor)
  );
}

function isMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
