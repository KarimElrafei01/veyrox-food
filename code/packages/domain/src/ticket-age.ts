export type AgeBand = 'green' | 'amber' | 'red';

/** A ticket a barista hasn't decided on yet (FR-3.1/FR-3.11) — WhatsApp `placed`,
 *  Till `pending`. Both land in New and share the same age-band clock. */
const UNACCEPTED_STATUSES = new Set(['placed', 'pending']);

/** FR-3.13: an unaccepted ticket escalates past 2 minutes waiting on Accept. */
const NEW_TICKET_WARNING_SECONDS = 120;

/** FR-3.8: red at 1.5x the amber threshold, for both the New-ticket clock and the
 *  promised-ETA clock — one multiplier, not two hand-typed thresholds. */
const RED_MULTIPLIER = 1.5;

/** Server can undo one bump within this window (FR-3.7). Exported so the client's
 *  countdown and the revert endpoint's guard can never drift apart (backend doc §2.5). */
export const REVERT_WINDOW_SECONDS = 60;

export interface TicketAgeInput {
  status: string;
  placedAt: Date;
  acceptedAt: Date | null;
  promisedEtaUpperAt: Date | null;
}

/**
 * Server-computed urgency color, never derived client-side from a fetched timestamp
 * (backend doc §1.2) — a tablet open for hours has clock drift, and every tablet in
 * the café must agree on the same amber/red moment.
 */
export function ageBand(ticket: TicketAgeInput, now: Date): AgeBand {
  const isNew = UNACCEPTED_STATUSES.has(ticket.status);
  const clockStart = isNew || ticket.acceptedAt === null ? ticket.placedAt : ticket.acceptedAt;
  const thresholdSeconds =
    isNew || ticket.promisedEtaUpperAt === null
      ? NEW_TICKET_WARNING_SECONDS
      : Math.max(0, (ticket.promisedEtaUpperAt.getTime() - clockStart.getTime()) / 1000);
  const elapsedSeconds = (now.getTime() - clockStart.getTime()) / 1000;

  if (elapsedSeconds > thresholdSeconds * RED_MULTIPLIER) return 'red';
  if (elapsedSeconds > thresholdSeconds) return 'amber';
  return 'green';
}
