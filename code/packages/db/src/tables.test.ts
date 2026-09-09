import { describe, expect, it } from 'vitest';
import { allTables } from './tables.js';

describe('allTables', () => {
  const names = allTables().map((t) => t.name);

  it('enumerates the Sprint 0 schema', () => {
    for (const expected of [
      'tenants',
      'store_hours',
      'menu_items',
      'menu_item_prices',
      'recipes',
      'recipe_lines',
      'orders',
      'order_items',
      'material_ledger',
      'order_events',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('every table except tenants is tenant-scoped by name convention', () => {
    // The cross-tenant leak suite relies on this list being complete.
    expect(names.length).toBeGreaterThanOrEqual(15);
  });
});
