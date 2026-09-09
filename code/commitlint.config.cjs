/**
 * Conventional Commits with scopes (CLAUDE.md — Conventions).
 * Examples: feat(till):, fix(ledger):, docs(adr):
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Bodies carry bullet lists, URLs, and the session footer — hard wrapping them
    // hurts readability more than it helps.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'scope-enum': [
      2,
      'always',
      [
        'repo',
        'backend',
        'frontends',
        'api',
        'worker',
        'order',
        'kds',
        'till',
        'console',
        'admin',
        'domain',
        'contracts',
        'db',
        'ui',
        'i18n',
        'ops-core',
        'api-client',
        'observability',
        'testkit',
        'infra',
        'ci',
        'docs',
        'adr',
        'ledger',
        'ordering',
        'catalog',
        'inventory',
        'loyalty',
        'payments',
        'messaging',
        'identity',
        'platform',
        'analytics',
        'deps',
      ],
    ],
  },
};
