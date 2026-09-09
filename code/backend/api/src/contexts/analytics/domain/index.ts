// The analytics context's public face (ADR-0019). Analytics is queries — read models and
// SQL over snapshotted facts (order_items freeze price, cost, versions and names; NFR-19).
// There is no behaviour to model and no aggregate. `application/` holds query handlers,
// `infrastructure/` the SQL. This file stays `export {}` unless a read-model type is
// genuinely shared outward.
export {};
