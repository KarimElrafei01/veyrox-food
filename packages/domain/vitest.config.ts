import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The pure domain kernel carries the strictest gate in the project
      // (docs/07-test-and-quality-strategy.md §2). Only modules that are
      // actually implemented are in scope today, so the gate stays green.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 90,
        branches: 100,
        functions: 90,
        statements: 90,
      },
    },
  },
});
