# Implementation diff — Console i18n full coverage

- workItemKey: `console-i18n-full-impl`
- activationId: `15ff16f8-8b85-4840-97d0-1b0474d9113a`
- capabilityId: `software.implementation.execute`
- stage: `implement`

## Change shape

Extend the existing i18n seam; no new framework, no new route, no backend
behavior change. `src/i18n/t.mjs` becomes the shared catalog/locale owner;
`runtime.ts` re-exports it so the Lingui-based provider keeps working.

- `src/i18n/t.mjs` (new): MESSAGES, `setCurrentLocale`, `getLocale`, `translate`, `t`.
  Initializes locale from the `aios-locale` cookie / `<html lang>` so
  module-level constants are translated at import time.
- `src/i18n/provider.tsx`, `src/app/layout.tsx`: set the active locale before
  rendering; writing the cookie now reloads so every surface (including
  module-level constants) switches language.
- 3 catalogs: 83 → 1100 identical keys. Source Chinese string is the key;
  `en` / `ja` values are natural translations, ICU placeholders preserved.
- 62 UI modules: all CJK literals routed through `t(...)` via AST codemod,
  including template literals converted to `t(icu, { ...values })`.
- New guard test `i18n-source-guard.test.mjs`: fails on any CJK literal outside
  catalog keys. No allowlist.

Diff scale: 68 files, +4245 / −1051 (mostly catalog data + mechanical t() calls).

## Self-check gate

| Acceptance criterion | Covered | Evidence |
|---|---|---|
| A1 every `t()` key resolves non-empty in all locales | yes | `i18n-catalogs.test.mjs`; 1100 keys each |
| A2 zero untranslated UI-authored literals | yes | `i18n-source-guard.test.mjs`; zero allowlist |
| A3 representative domain copy translated | yes | `i18n-full-coverage.test.mjs` (gateway/routing/resources, 3 locales) |
| A4 locale switch still drives lang/cookie, routes unchanged | yes | `locale.test.mjs`; `ui:typecheck`; `ui:build` exit 0 |
| A5 ICU placeholders interpolate in all locales | yes | `interpolate.test.mjs`; source guard passes with placeholder keys |
| No assertion weakened / skipped | yes | RED test unchanged; all new tests additive |

## Focused verification

`receipt:0e8aeb11-26bb-4fe0-a8ca-b191368c3139` —
`node --test apps/shell/ui/tests/{i18n-catalogs,i18n-full-coverage,i18n-source-guard,interpolate,locale}.test.mjs`
exit 0, tests 10 / pass 10 / fail 0.

`npm run ui:typecheck` exit 0. `npm run ui:build` exit 0 (only pre-existing
turbopack tracing warnings).

## Boundary

Translation of backend-returned payload strings (CLI stdout/stderr, file paths,
model IDs) remains out of scope by the accepted test contract. No machine
translation service, no network call, no new runtime dependency.
