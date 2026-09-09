import { describe, expect, it } from 'vitest';
import { withDatabaseName } from './pg.js';

describe('withDatabaseName', () => {
  it('swaps the database path, keeping credentials and host', () => {
    expect(withDatabaseName('postgres://u:p@localhost:5432/veyrox_food', 'veyrox_test_abc')).toBe(
      'postgres://u:p@localhost:5432/veyrox_test_abc',
    );
  });
});
