/**
 * Shared by code/frontends/kds and code/frontends/till: offline outbox, service
 * worker, device enrollment, staff PIN flow, SSE client, staleness banner.
 *
 * Sprint 3 (SSE client, device/PIN) lands here first; the offline outbox and
 * service worker are Sprint 4 (Till) scope and remain unbuilt (docs/06 -
 * F2 frontend-implementation.md's 2026-09-12 scope-correction note).
 */
export {
  connectStaffStream,
  type SseFrame,
  type StaffStream,
  type StaffStreamOptions,
} from './sse-client.js';
export {
  bootstrapStaffSessionFromUrl,
  clearStoredStaffSession,
  readStoredStaffSession,
  storeStaffSession,
  type StaffSession,
} from './staff-session.js';
