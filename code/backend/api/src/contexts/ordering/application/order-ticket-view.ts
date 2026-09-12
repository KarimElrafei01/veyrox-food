import { ageBand, REVERT_WINDOW_SECONDS } from '@veyroxai/domain';
import type { OrderTicket } from '@veyroxai/contracts';
import type { OrderStatus } from '../domain/order-state-machine.js';

export interface OrderTicketItemSource {
  orderItemId: string;
  qty: number;
  nameSnapshotEn: string;
  nameSnapshotAr: string | null;
  modifiers: readonly { nameSnapshotEn: string; nameSnapshotAr: string | null }[];
  ticked: boolean;
}

export interface OrderTicketSource {
  orderId: string;
  orderNumber: string;
  channel: 'whatsapp' | 'cashier';
  status: OrderStatus;
  tableLabel: string | null;
  customerNote: string | null;
  placedAt: Date;
  acceptedAt: Date | null;
  promisedEtaUpperAt: Date | null;
  customer: { displayName: string | null; tier: 'bronze' | 'silver' | 'gold' } | null;
  items: readonly OrderTicketItemSource[];
  /** created_at of the most recent order_events row where actor_type='staff' that
   *  produced the current status — null if no staff transition produced it (e.g.
   *  a still-New ticket nobody has acted on). Drives revertWindow (FR-3.7). */
  lastStaffTransitionAt: Date | null;
}

function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/** en/'ar-EG' name-snapshot shape shared by items and modifiers (backend doc §1). */
function nameSnapshotOf(en: string, ar: string | null): { en: string; 'ar-EG'?: string } {
  return ar ? { en, 'ar-EG': ar } : { en };
}

/**
 * Assembles one order's board-ready view (backend doc §1's `OrderTicket` shape).
 * Shared by every KDS mutation's response and, batched, by GET /staff/board —
 * one implementation of "what a ticket looks like," never five ad hoc shapes.
 */
export function buildOrderTicket(source: OrderTicketSource, now: Date): OrderTicket {
  const band = ageBand(
    {
      status: source.status,
      placedAt: source.placedAt,
      acceptedAt: source.acceptedAt,
      promisedEtaUpperAt: source.promisedEtaUpperAt,
    },
    now,
  );
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - source.placedAt.getTime()) / 1000));

  const revertibleUntil = source.lastStaffTransitionAt
    ? new Date(source.lastStaffTransitionAt.getTime() + REVERT_WINDOW_SECONDS * 1000)
    : null;
  const revertWindow =
    revertibleUntil && revertibleUntil.getTime() > now.getTime()
      ? { revertibleUntil: revertibleUntil.toISOString() }
      : null;

  return {
    orderId: source.orderId,
    orderNumber: source.orderNumber,
    channel: source.channel,
    status: source.status,
    customerFirstName: source.customer?.displayName
      ? firstNameOf(source.customer.displayName)
      : null,
    tableLabel: source.tableLabel,
    fulfillment: 'pickup', // DEC-01: one store QR, counter pickup by default
    isPriority: source.customer?.tier === 'gold', // Gold perk: priority prep (docs/01 §4.5)
    placedAt: source.placedAt.toISOString(),
    acceptedAt: source.acceptedAt?.toISOString() ?? null,
    promisedEtaUpperAt: source.promisedEtaUpperAt?.toISOString() ?? null,
    ageSeconds,
    ageBand: band,
    items: source.items.map((item) => ({
      orderItemId: item.orderItemId,
      qty: item.qty,
      nameSnapshot: nameSnapshotOf(item.nameSnapshotEn, item.nameSnapshotAr),
      modifiers: item.modifiers.map((modifier) => ({
        nameSnapshot: nameSnapshotOf(modifier.nameSnapshotEn, modifier.nameSnapshotAr),
        // No allergen data model exists yet (menu_items/modifier_options carry no
        // allergen flag) - Catalog's to add; ticket renders without the highlight
        // until then rather than inventing a column here.
        isAllergenFlag: false,
      })),
      allergenNote: null,
      ticked: item.ticked,
    })),
    customerNote: source.customerNote,
    revertWindow,
    syncState: 'confirmed', // provisional/pending_local only ever exist client-side (ADR-0022)
  };
}
