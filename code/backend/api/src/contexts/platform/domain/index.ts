// The platform context's public face (ADR-0019). Tenants, entitlements, flags, and the
// settings registry. Config resolves platform capability → tenant entitlement → tenant
// preference; a key absent from setting_definitions cannot be set by anyone (ADR-0015).
// That resolution is `resolveFeature()` in @veyroxai/domain. Plain services here; the
// resolved-config type and any published events land in this file when built (S6–S7).
export {};
