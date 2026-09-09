/** F1.6 §7. Kept as an explicit sink until the OTel transport is installed, the
 *  same shape the ETA context uses. */
export interface OrderPlacementMetricSink {
  increment(
    name:
      | 'orders_placed_total'
      | 'idempotency_replay_total'
      | 'price_changed_total'
      | 'order_placement_rejected_total',
    labels?: Record<string, string>,
  ): void;
  observe(name: 'order_placement_duration_seconds', seconds: number): void;
}
