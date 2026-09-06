// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
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
    rules: {
      // No `any` without an inline justification (CLAUDE.md code rules).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
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
