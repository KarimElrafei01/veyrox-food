// The loyalty context's public face (ADR-0019). Loyalty carries invariants — points
// accrue once per paid order, tier is a pure function of lifetime points, a clawback
// negates the exact accrual it reverses (loyalty_ledger, append-only). The aggregate and
// its events land here as they are built (S2). `perksForTier` / `tierForPoints` etc. live
// in @veyroxai/domain because the customer webview needs them too.
export {};
