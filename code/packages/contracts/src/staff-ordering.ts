import { z } from 'zod';

/**
 * F2 — Kitchen Display System, request/response contracts for `/orders/:id/*` and
 * `/staff/*` (docs/features/F2-kitchen-display-system/). Idempotency key travels in
 * the body here, not a header — matching every JSON example in the F2 backend doc
 * and 05-api-and-integration-contracts.md §3, a deliberately different convention
 * from the customer realm's `Idempotency-Key` header (./problem-details.ts).
 */

/** `Bearer <device_jwt>` + `X-Staff-PIN-Token` (05-api-and-integration-contracts.md
 *  §1) - every staff/KDS mutation and read carries both. */
export const staffAuthHeaders = z.object({
  authorization: z.string(),
  'x-staff-pin-token': z.string(),
});
export type StaffAuthHeaders = z.infer<typeof staffAuthHeaders>;

const nameSnapshot = z.object({ en: z.string(), 'ar-EG': z.string().optional() });

const ticketModifier = z.object({
  nameSnapshot,
  isAllergenFlag: z.boolean(),
});

const ticketItem = z.object({
  orderItemId: z.uuid(),
  qty: z.number().int().positive(),
  nameSnapshot,
  modifiers: z.array(ticketModifier),
  allergenNote: z.string().nullable(),
  ticked: z.boolean(),
});

const ageBand = z.enum(['green', 'amber', 'red']);
const syncState = z.enum(['confirmed', 'provisional', 'pending_local']);

/**
 * One order, denormalized for the KDS board — a read-model, not the raw `orders`
 * row (backend doc §1). `ageBand`/`revertWindow` are server-computed; the client
 * must never derive urgency color or undo-eligibility from wall-clock math.
 */
export const orderTicket = z.object({
  orderId: z.uuid(),
  orderNumber: z.string(),
  channel: z.enum(['whatsapp', 'cashier']),
  status: z.string(),
  customerFirstName: z.string().nullable(),
  tableLabel: z.string().nullable(),
  fulfillment: z.literal('pickup'), // DEC-01: one store QR, counter pickup by default
  isPriority: z.boolean(),
  placedAt: z.string().datetime({ offset: true }),
  acceptedAt: z.string().datetime({ offset: true }).nullable(),
  promisedEtaUpperAt: z.string().datetime({ offset: true }).nullable(),
  ageSeconds: z.number().int().nonnegative(),
  ageBand,
  items: z.array(ticketItem),
  customerNote: z.string().nullable(),
  revertWindow: z.object({ revertibleUntil: z.string().datetime({ offset: true }) }).nullable(),
  syncState,
});

export type OrderTicket = z.infer<typeof orderTicket>;

export const acceptOrderRequest = z.object({ idempotencyKey: z.uuid() });
export type AcceptOrderRequest = z.infer<typeof acceptOrderRequest>;

export const rejectOrderRequest = z.object({
  reasonCode: z.enum(['too_busy', 'item_unavailable', 'closing']),
  idempotencyKey: z.uuid(),
});
export type RejectOrderRequest = z.infer<typeof rejectOrderRequest>;

export const advanceOrderRequest = z.object({
  toStatus: z.enum(['preparing', 'ready']),
  idempotencyKey: z.uuid(),
});
export type AdvanceOrderRequest = z.infer<typeof advanceOrderRequest>;

export const revertOrderRequest = z.object({ idempotencyKey: z.uuid() });
export type RevertOrderRequest = z.infer<typeof revertOrderRequest>;

export const tickItemRequest = z.object({ ticked: z.boolean(), idempotencyKey: z.uuid() });
export type TickItemRequest = z.infer<typeof tickItemRequest>;

export const tickItemResponse = z.object({ orderItemId: z.uuid(), ticked: z.boolean() });
export type TickItemResponse = z.infer<typeof tickItemResponse>;

/** Every machine `code` F2's staff endpoints can return, beyond the platform-wide
 *  ones (SESSION_INVALID/SESSION_EXPIRED). Clients switch on these, never on prose. */
export const kitchenOrderErrorCode = z.enum([
  'ORDER_NOT_FOUND',
  'INVALID_TRANSITION',
  'ITEM_NO_LONGER_AVAILABLE',
  'REVERT_WINDOW_EXPIRED',
  'MANAGER_PIN_REQUIRED',
]);
export type KitchenOrderErrorCode = z.infer<typeof kitchenOrderErrorCode>;

export const invalidTransitionProblem = z.object({
  code: z.literal('INVALID_TRANSITION'),
  allowedTransitions: z.array(z.string()),
  traceId: z.string(),
});
export type InvalidTransitionProblem = z.infer<typeof invalidTransitionProblem>;

/** GET /staff/board (backend doc §1) - full snapshot, used on first load and
 *  gap-cap resync, never polled. */
export const setActiveStationsRequest = z.object({
  activeStations: z.number().int().min(1).max(12), // kitchen_state's own CHECK range
  idempotencyKey: z.uuid(),
});
export type SetActiveStationsRequest = z.infer<typeof setActiveStationsRequest>;

export const setActiveStationsResponse = z.object({
  activeStations: z.number().int().min(1).max(12),
  updatedAt: z.string().datetime({ offset: true }),
});
export type SetActiveStationsResponse = z.infer<typeof setActiveStationsResponse>;

/**
 * GET /staff/stream's per-event `data` payloads (backend doc §3 / sse-events.ts,
 * stream-board.ts's replay). Not asserted server-side today - the backend
 * constructs these object literals directly - but the frontend's SSE reducer
 * parses every frame against these, since a silently-wrong wire shape here
 * would corrupt live board state with no error until a screenshot caught it.
 */
export const orderTransitionedEvent = z.object({
  orderId: z.uuid(),
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  actorType: z.string(),
  occurredAt: z.string().datetime({ offset: true }),
  order: orderTicket,
});
export type OrderTransitionedEvent = z.infer<typeof orderTransitionedEvent>;

export const orderItemTickedEvent = z.object({
  orderId: z.uuid(),
  orderItemId: z.uuid(),
  ticked: z.boolean(),
  occurredAt: z.string().datetime({ offset: true }),
});
export type OrderItemTickedEvent = z.infer<typeof orderItemTickedEvent>;

export const kitchenStateChangedEvent = z.object({
  activeStations: z.number().int().min(1).max(12),
  updatedAt: z.string().datetime({ offset: true }),
});
export type KitchenStateChangedEvent = z.infer<typeof kitchenStateChangedEvent>;

export const boardSnapshotResponse = z.object({
  // order_events.id is a uuid v7 PK (04-data-model.md §2), not the plain
  // integer the backend doc's own illustrative example shows - uuid v7 sorts
  // chronologically, so Last-Event-ID replay's `id > lastSeen` still works
  // correctly as a byte comparison. Null only for a tenant with zero events ever.
  asOfEventId: z.uuid().nullable(),
  activeStations: z.number().int().positive(),
  columns: z.object({
    new: z.array(orderTicket),
    received: z.array(orderTicket),
    preparing: z.array(orderTicket),
    ready: z.array(orderTicket),
  }),
  metrics: z.object({
    activeTicketCount: z.number().int().nonnegative(),
    delayedOver15mCount: z.number().int().nonnegative(),
    avgTurnaroundSeconds: z.number().int().nonnegative(),
    railCapacity: z.object({
      used: z.number().int().nonnegative(),
      slots: z.number().int().positive(),
    }),
    peakVelocityPerHour: z.number().int().nonnegative(),
  }),
  traceId: z.string(),
});
export type BoardSnapshotResponse = z.infer<typeof boardSnapshotResponse>;

/** The `board.snapshot` SSE event's data (ADR-0005 gap-cap resync,
 *  stream-board.ts) - the same shape minus `traceId`, which only the HTTP
 *  response adds. */
export const boardSnapshotStreamEvent = boardSnapshotResponse.omit({ traceId: true });
export type BoardSnapshotStreamEvent = z.infer<typeof boardSnapshotStreamEvent>;
