import { useMemo, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import type { MessageKey } from '@veyroxai/i18n';
import type { OrderTicket, RejectOrderRequest } from '@veyroxai/contracts';
import { getApiClient } from '../../../shared/api.js';
import { createAcceptGateRepo } from '../repo/acceptGateRepo.js';

export type AcceptGatePhase = 'idle' | 'accepting' | 'accepted' | 'rejecting' | 'error';

/** §2.3's tactile flash ("ACCEPTED · SENT TO LINE") must be perceptible before
 *  the modal closes - this is the one screen where a barista must have zero
 *  doubt the tap registered, because Accept is what starts consuming real
 *  inventory. */
const ACCEPT_FLASH_MS = 600;

/** Owns Screen 3.2's two mutations. Idempotency keys are memoized per
 *  `orderId` (one for Accept, one for Reject, never shared) rather than
 *  generated per tap: §2.4 needs a fast double-tap or a client retry to
 *  reuse the *same* key so the backend's own dedup (not this hook) is what
 *  stops a double deduction - a fresh key on every call would defeat that
 *  by giving the backend two genuinely different requests to execute. */
export function useAcceptGate(
  orderId: string,
  onDecided: (ticket: OrderTicket) => void,
): {
  phase: AcceptGatePhase;
  error: MessageKey | null;
  reasonPanelOpen: boolean;
  toggleReasonPanel: () => void;
  accept: () => void;
  reject: (reasonCode: RejectOrderRequest['reasonCode']) => void;
} {
  const repo = useMemo(() => createAcceptGateRepo(getApiClient()), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately stable per orderId only, see comment above
  const acceptKey = useMemo(() => uuidv7(), [orderId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately stable per orderId only, see comment above
  const rejectKey = useMemo(() => uuidv7(), [orderId]);
  const [phase, setPhase] = useState<AcceptGatePhase>('idle');
  const [reasonPanelOpen, setReasonPanelOpen] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  const accept = (): void => {
    if (phase === 'accepting' || phase === 'accepted') return;
    setPhase('accepting');
    setError(null);
    void repo
      .accept(orderId, acceptKey)
      .then((ticket) => {
        setPhase('accepted');
        window.setTimeout(() => onDecided(ticket), ACCEPT_FLASH_MS);
      })
      .catch(() => {
        setPhase('error');
        setError('kds.error.generic');
      });
  };

  const reject = (reasonCode: RejectOrderRequest['reasonCode']): void => {
    if (phase === 'rejecting') return;
    setPhase('rejecting');
    setError(null);
    void repo
      .reject(orderId, reasonCode, rejectKey)
      .then((ticket) => onDecided(ticket))
      .catch(() => {
        setPhase('error');
        setError('kds.error.generic');
      });
  };

  return {
    phase,
    error,
    reasonPanelOpen,
    toggleReasonPanel: () => setReasonPanelOpen((open) => !open),
    accept,
    reject,
  };
}
