# Frontends

Five Vite + React 19 SPAs, static to Cloudflare Pages, no SSR (ADR-0009).

| App       | Port | Realm / entry            | Shares                     |
| --------- | ---- | ------------------------ | -------------------------- |
| `order`   | 3002 | customer token (webview) | `ui`, `i18n`, `api-client` |
| `kds`     | 3003 | staff device + PIN       | + `ops-core`               |
| `till`    | 3004 | staff device + PIN       | + `ops-core`               |
| `console` | 3005 | owner (argon2id + TOTP)  | `ui`, `i18n`, `api-client` |
| `admin`   | 3006 | platform (WebAuthn)      | `ui`, `i18n`, `api-client` |

## Every feature, the same six folders (ADR-0018)

```
src/features/<feature>/
├── ui/           screen(s) — route-level composition, props/context in, callbacks out
├── components/   presentational pieces only this feature uses
├── hooks/        useX — React glue over a usecase, holds loading/error/data
├── usecases/     pure orchestration over repos — testable without React
├── repo/         wire DTO ↔ the model the feature holds; retry/fallback policy
└── datasource/   one transport call each → @veyroxai/api-client + a contract schema
```

No exemptions — a feature with nothing to translate has a one-line pass-through `repo/`.
`src/shared/` holds anything used by two features; a package holds anything used by two apps.
Lint (`import-x/no-restricted-paths`) fails a cross-feature import.

## Known follow-up

`order`'s six existing features (built before ADR-0018) still fold transport and translation
into `repo/`. Splitting each into `datasource/` (the fetch) + `repo/` (the mapping) is
mechanical but the line is a per-feature call — best done alongside F1 frontend work, not in
the restructure. The folders are already present. Tracked in `docs/adr/ADR-0018`.
