export interface EtaCartItem {
  prepSeconds: number;
}

export interface QueueTicket {
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
): EtaRange {
  const relevantTickets =
    customerTier === 'gold' ? tickets.filter((ticket) => ticket.tier === 'gold') : tickets;
  const queueSeconds =
    relevantTickets.reduce((total, ticket) => total + remainingTicketSeconds(ticket, now), 0) /
    Math.max(1, activeStations);
  const etaSeconds = cartPrepSeconds(items) + queueSeconds;
  return {
    lowerMinutes: roundUpToFiveMinutes(etaSeconds * 0.9),
    upperMinutes: roundUpToFiveMinutes(etaSeconds * 1.25),
    queueDepth: relevantTickets.length,
  };
}
