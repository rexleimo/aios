# Implementation diff — Console UI i18n (GREEN)

Green receipt: `receipt:d5102b98-9903-4fbf-b641-700f46f47a63` (`node --test apps/shell/ui/tests/i18n-catalogs.test.mjs apps/shell/ui/tests/locale.test.mjs`, exit 0).

## Changed files (git diff --stat)

```
apps/shell/ui/package-lock.json                            | 1432 +++++++++---
apps/shell/ui/package.json                                 |    3 +
apps/shell/ui/src/app/layout.tsx                           |   23 ++-
apps/shell/ui/src/components/console/console-workspace.tsx |  105 ++++----
apps/shell/ui/src/components/console/home-workspace.tsx    |   39 ++--
apps/shell/ui/src/components/ui/states.tsx                 |    9 +-
apps/shell/ui/src/lib/console-navigation.ts                |   16 +-
apps/shell/ui/src/proxy.ts                                 |   12 +-
8 files changed, 1541 insertions(+), 98 deletions(-)
```

## New files

- `apps/shell/ui/src/i18n/locales.mjs` — locale facts and resolution (no framework imports).
- `apps/shell/ui/src/i18n/runtime.ts` — isolated Lingui instances via `setupI18n`.
- `apps/shell/ui/src/i18n/provider.tsx` — client provider, locale cookie, `useT`/`useLocale`.
- `apps/shell/ui/src/i18n/switcher.tsx` — language selector in the Console header.
- `apps/shell/ui/src/i18n/server.ts` — server metadata locale + translate helper.
- `apps/shell/ui/src/i18n/catalogs/{zh-CN,en,ja}.json` — 81 message keys, identical key sets.
- `apps/shell/ui/tests/i18n-catalogs.test.mjs`, `tests/locale.test.mjs` — focused tests.

## Boundary

Locale state has one owner (`src/i18n/locales.mjs`) and one persistence channel (cookie `aios-locale`, forwarded by `proxy.ts` into `x-aios-locale`). Routes, legacy redirects, Tauri deep links and `ws=<key>` are untouched.
