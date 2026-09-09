// The ordering context's public face. Another context imports only from here —
// published events and public types, never a repository or a use case (ADR-0019).
export { isStoreOpen, nextStoreOpening, type StoreHour, type StoreClosure } from './store-hours.js';
