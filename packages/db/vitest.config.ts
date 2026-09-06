import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/__integration__/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/__integration__/**/*.test.ts'],
          // Real Postgres, provisioned per file (docs/07 §4). Keep serial.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
