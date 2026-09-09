/**
 * Shared by apps/kds and apps/till: offline outbox, service worker, device
 * enrollment, staff PIN flow, SSE client, staleness banner.
 *
 * These land in Sprint 3 (SSE client, device/PIN) and Sprint 4 (outbox, service
 * worker). This package exists now so both apps depend on it from the start and
 * nothing device-shaped is written twice (docs/14 §1, ADR-0009 amendment).
 */
export const OPS_CORE_PLACEHOLDER = true;
