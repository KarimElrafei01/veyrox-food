// @ts-check
import fs from 'node:fs';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';

/**
 * Flat config, shared across the monorepo.
 * Per-project overrides (React, Node globals) live in each workspace's own eslint.config.js
 * which imports and spreads `base`.
 */
export const base = tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node context for config files, scripts, and backend/tooling source.
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    // Resolve NodeNext-style `.js` specifiers back to their `.ts` source so the
    // import/no-restricted-paths walls (ADR-0018, ADR-0019) can see the real target.
    settings: {
      'import-x/resolver-next': [
        importX.createNodeResolver({
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
          extensionAlias: { '.js': ['.ts', '.tsx', '.js'], '.jsx': ['.tsx', '.jsx'] },
        }),
      ],
    },
  },
  {
    rules: {
      // No `any` without an inline justification (CLAUDE.md code rules).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': 'off',

      // Guard clauses over nesting, max depth 3 (CLAUDE.md).
      'max-depth': ['error', 3],

      // Money = branded integer minor units. A raw number must never do money arithmetic
      // (ADR-0007, NFR-18/60). This is the cheap syntactic guard; the type-aware rule lands
      // in Sprint 1 alongside domain.priceCart(), where there is real arithmetic to check.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'BinaryExpression[operator=/^[+\\-*\\/%]$/] > Identifier[name=/_minor$/i], BinaryExpression[operator=/^[+\\-*\\/%]$/] > MemberExpression > Identifier[name=/_minor$/i]',
          message:
            'Do not do arithmetic on *_minor values directly. Use the Minor helpers in @veyroxai/domain (ADR-0007).',
        },
      ],
    },
  },
);

/**
 * The context wall (ADR-0019). A file in one bounded context may import another context
 * only through `contexts/<other>/domain/index` — its published events and public types.
 * Spread into `code/backend/api`'s own config.
 */
const BACKEND_CONTEXTS = [
  'ordering',
  'catalog',
  'inventory',
  'loyalty',
  'payments',
  'messaging',
  'identity',
  'platform',
  'analytics',
];

export const backendContextBoundaries = tseslint.config({
  // Production code only. A test may wire several contexts to exercise app behaviour
  // (the 500-handling and cross-tenant-leak suites do); the wall is about architecture.
  files: ['src/contexts/**/*.{ts,tsx}'],
  ignores: ['src/contexts/**/*.test.{ts,tsx}'],
  plugins: { 'import-x': importX },
  rules: {
    'import-x/no-restricted-paths': [
      'error',
      {
        zones: BACKEND_CONTEXTS.map((ctx) => ({
          from: `./src/contexts/${ctx}`,
          target: BACKEND_CONTEXTS.filter((other) => other !== ctx).map(
            (other) => `./src/contexts/${other}`,
          ),
          except: ['./domain/index.ts'],
          message: `Cross-context import. Use contexts/${ctx}/domain/index — events and public types only (ADR-0019).`,
        })),
      },
    ],
  },
});

/**
 * Feature isolation (ADR-0018). A file in one feature may not import another feature —
 * shared code goes to the app's `src/shared`, then a package. Reads the feature folders
 * at load time, so it needs no maintenance as features are added. Call from each SPA's
 * own config with the default `./src/features` (resolved from that app's directory).
 */
export function frontendFeatureBoundaries(featuresDir = './src/features') {
  let features = [];
  try {
    features = fs
      .readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // No features scaffolded yet — nothing to isolate.
  }

  // no-restricted-paths rejects an empty `zones` array, so with 0 or 1 features there is
  // nothing to enforce and nothing to add.
  if (features.length < 2) {
    return [];
  }

  return tseslint.config({
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/**/*.test.{ts,tsx}'],
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: features.map((feature) => ({
            from: `./src/features/${feature}`,
            target: features
              .filter((other) => other !== feature)
              .map((other) => `./src/features/${other}`),
            message:
              'Features do not import each other. Promote shared code to src/shared, then to a package (ADR-0018).',
          })),
        },
      ],
    },
  });
}

/** Extra rules for the browser SPAs. Spread after `base` in each app's config. */
export const react = tseslint.config({
  files: ['**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  languageOptions: {
    globals: { ...globals.browser },
  },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
});

export default base;
