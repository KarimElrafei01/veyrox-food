import { useCallback, useEffect, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { ApiError } from '@veyroxai/api-client';
import type { StaffStream } from '@veyroxai/ops-core';
import { getApiBaseUrl, getApiClient } from '../../../shared/api.js';
import { createBoardRepo, type BoardRepo } from '../repo/boardRepo.js';
import { subscribeToBoardStream } from '../datasource/subscribeToBoardStream.js';
import {
  applyStreamEvent,
  boardStateFromSnapshot,
  findTicketInState,
  type BoardState,
} from '../usecases/boardState.js';

function isSessionError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'SESSION_INVALID' || error.code === 'SESSION_EXPIRED')
  );
}

export interface UseBoardResult {
  state: BoardState | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
  lastBumpedOrderId: string | null;
  advance: (orderId: string, toStatus: 'preparing' | 'ready') => Promise<void>;
  tick: (orderId: string, orderItemId: string, ticked: boolean) => Promise<void>;
  revert: (orderId: string) => Promise<void>;
  setStations: (activeStations: number) => Promise<void>;
  reconnect: () => void;
}

/** Owns the single EventSource for the whole app (opened once here, at the
 *  board's mount, not per-screen) and the normalized board state every
 *  screen reads from - screens 3.2-3.5 are overlays on this, not separate
 *  data-fetching roots (frontend doc §1.6). */
export function useBoard(options: {
  deviceToken: string;
  onSessionInvalid: () => void;
}): UseBoardResult {
  const { deviceToken, onSessionInvalid } = options;
  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // In-memory only, per §1.4: "if the app was reloaded since that bump,
  // disable the button rather than guessing" - never persisted.
  const [lastBumpedOrderId, setLastBumpedOrderId] = useState<string | null>(null);
  const repoRef = useRef<BoardRepo | null>(null);
  repoRef.current ??= createBoardRepo(getApiClient());
  const streamRef = useRef<StaffStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError(null);
      try {
        const snapshot = await repoRef.current!.fetchSnapshot();
        if (cancelled) return;
        setState(boardStateFromSnapshot(snapshot));
        setLoading(false);
        streamRef.current = subscribeToBoardStream({
          baseUrl: getApiBaseUrl(),
          deviceToken,
          lastEventId: snapshot.asOfEventId,
          onEvent: (event) => setState((prev) => (prev ? applyStreamEvent(prev, event) : prev)),
          onStaleChange: setStale,
        });
      } catch (err) {
        if (cancelled) return;
        if (isSessionError(err)) {
          onSessionInvalid();
          return;
        }
        setLoading(false);
        setError('kds.error.generic');
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.close();
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSessionInvalid is stable from the caller
  }, [deviceToken]);

  const advance = useCallback(
    async (orderId: string, toStatus: 'preparing' | 'ready') => {
      const before = state ? findTicketInState(state, orderId) : null;
      if (!before) return;
      // Optimistic status-only patch (DESIGN.md "immediate scale shift... solid
      // contrast inversion" - tactile feedback must be instant); the fuller
      // fields (ageBand, timers) settle a moment later from the real response.
      setState((prev) =>
        prev
          ? applyStreamEvent(prev, {
              type: 'order.transitioned',
              orderId,
              fromStatus: before.status,
              toStatus,
              actorType: 'staff',
              occurredAt: new Date().toISOString(),
              order: { ...before, status: toStatus },
            })
          : prev,
      );
      try {
        const ticket = await repoRef.current!.advance(orderId, toStatus, uuidv7());
        setState((prev) =>
          prev
            ? applyStreamEvent(prev, {
                type: 'order.transitioned',
                orderId,
                fromStatus: before.status,
                toStatus: ticket.status,
                actorType: 'staff',
                occurredAt: new Date().toISOString(),
                order: ticket,
              })
            : prev,
        );
        setLastBumpedOrderId(orderId);
      } catch (err) {
        if (isSessionError(err)) return onSessionInvalid();
        // Roll back to the pre-optimistic ticket - a failed advance must not
        // leave the board showing a status the server never accepted.
        setState((prev) =>
          prev
            ? applyStreamEvent(prev, {
                type: 'order.transitioned',
                orderId,
                fromStatus: toStatus,
                toStatus: before.status,
                actorType: 'staff',
                occurredAt: new Date().toISOString(),
                order: before,
              })
            : prev,
        );
        setError('kds.error.generic');
      }
    },
    [state, onSessionInvalid],
  );

  const tick = useCallback(
    async (orderId: string, orderItemId: string, ticked: boolean) => {
      setState((prev) =>
        prev
          ? applyStreamEvent(prev, {
              type: 'order.item_ticked',
              orderId,
              orderItemId,
              ticked,
              occurredAt: new Date().toISOString(),
            })
          : prev,
      );
      try {
        await repoRef.current!.tick(orderId, orderItemId, ticked, uuidv7());
      } catch (err) {
        if (isSessionError(err)) return onSessionInvalid();
        setState((prev) =>
          prev
            ? applyStreamEvent(prev, {
                type: 'order.item_ticked',
                orderId,
                orderItemId,
                ticked: !ticked,
                occurredAt: new Date().toISOString(),
              })
            : prev,
        );
        setError('kds.error.generic');
      }
    },
    [onSessionInvalid],
  );

  const revert = useCallback(
    async (orderId: string) => {
      try {
        const ticket = await repoRef.current!.revert(orderId, uuidv7());
        setState((prev) =>
          prev
            ? applyStreamEvent(prev, {
                type: 'order.transitioned',
                orderId,
                fromStatus: null,
                toStatus: ticket.status,
                actorType: 'staff',
                occurredAt: new Date().toISOString(),
                order: ticket,
              })
            : prev,
        );
        setLastBumpedOrderId((current) => (current === orderId ? null : current));
      } catch (err) {
        if (isSessionError(err)) return onSessionInvalid();
        setError('kds.error.generic');
      }
    },
    [onSessionInvalid],
  );

  const setStations = useCallback(
    async (activeStations: number) => {
      try {
        const result = await repoRef.current!.setStations(activeStations, uuidv7());
        setState((prev) => (prev ? { ...prev, activeStations: result.activeStations } : prev));
      } catch (err) {
        if (isSessionError(err)) return onSessionInvalid();
        setError('kds.error.generic');
      }
    },
    [onSessionInvalid],
  );

  return {
    state,
    loading,
    stale,
    error,
    lastBumpedOrderId,
    advance,
    tick,
    revert,
    setStations,
    reconnect: () => streamRef.current?.reconnect(),
  };
}
