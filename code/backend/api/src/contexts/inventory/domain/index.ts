// The inventory context's public face (ADR-0019). Inventory is the invariant core:
// materials move only through append-only material_ledger; a void inserts the exact
// negation of that order's sale_deduction rows via reverses_ledger_id and NEVER recomputes
// from recipes; abandoned is waste, not a return (INV-7). The Ledger aggregate and its
// events (MaterialsDeducted, DeductionReversed) land here when built (S4–S5).
export {};
