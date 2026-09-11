export interface EtaCartItem {
  prepSeconds: number;
}

export interface QueueTicket {
  orderId?: string;
  prepSeconds: number;
  status: 'received' | 'preparing';
  startedAt: Date | null;
  tier: 'bronze' | 'silver' | 'gold' | null;
}

export interface EtaRange {
  lowerMinutes: number;
  upperMinutes: number;
  queueDepth: number;
}

const MAX_PREP_SECONDS = 900;

function roundUpToFiveMinutes(seconds: number): number {
  return Math.ceil(seconds / 300) * 5;
}

function cartPrepSeconds(items: readonly EtaCartItem[]): number {
  const prepSeconds = items.map((item) => Math.max(0, item.prepSeconds)).sort((a, b) => b - a);
  const [longest = 0, ...other] = prepSeconds;
  return Math.min(
    MAX_PREP_SECONDS,
    longest + other.reduce((total, seconds) => total + seconds * 0.4, 0),
  );
}

function remainingTicketSeconds(ticket: QueueTicket, now: Date): number {
  if (ticket.status === 'received' || ticket.startedAt === null)
    return Math.max(0, ticket.prepSeconds);
  return Math.max(
    0,
    ticket.prepSeconds - Math.floor((now.getTime() - ticket.startedAt.getTime()) / 1000),
  );
}

/**
 * Estimates a range rather than a point: missing a promise hurts more than being
 * early, so the upper bound is intentionally wider (F1.4).
 */
export function estimateEta(
  items: readonly EtaCartItem[],
  tickets: readonly QueueTicket[],
  customerTier: QueueTicket['tier'],
  activeStations: number,
  now: Date,
  upperMultiplier = 1.25,
): EtaRange {
  const relevantTickets =
    customerTier === 'gold' ? tickets.filter((ticket) => ticket.tier === 'gold') : tickets;
  const queueSeconds =
    relevantTickets.reduce((total, ticket) => total + remainingTicketSeconds(ticket, now), 0) /
    Math.max(1, activeStations);
  const etaSeconds = cartPrepSeconds(items) + queueSeconds;
  const lowerMinutes = roundUpToFiveMinutes(etaSeconds * 0.9);
  let upperMinutes = roundUpToFiveMinutes(etaSeconds * upperMultiplier);
  // The ×0.9/×upperMultiplier bounds can round into the same 5-minute bucket for
  // short prep times, collapsing the promised range into a repeated number — which
  // F1.4 §1 forbids ("a range, never a point"). Widen by one bucket rather than let
  // it collapse; an all-zero cart (nothing to prepare) is left at 0–0 on purpose.
  if (lowerMinutes > 0 && upperMinutes <= lowerMinutes) {
    upperMinutes = lowerMinutes + 5;
  }
  return {
    lowerMinutes,
    upperMinutes,
    queueDepth: relevantTickets.length,
  };
}
