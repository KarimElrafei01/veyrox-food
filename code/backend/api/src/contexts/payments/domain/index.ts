// The payments context's public face (ADR-0019). No PSP in v1 — an order is paid only
// when an attributed staff member records `cash` or `visa` at collection (`visa` = the
// café's own terminal). Plain services over repositories, no aggregate root. The
// OrderPaid event and the EOD-rollup types land here when built (S3).
export {};
