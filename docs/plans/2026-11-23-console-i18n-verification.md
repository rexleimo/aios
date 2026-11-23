# Verification evidence — Console UI i18n

All commands run from `E:\coding\harness-cli` on 2026-11-23 after the final edit.

| command | result |
|---|---|
| `node --test apps/shell/ui/tests/i18n-catalogs.test.mjs apps/shell/ui/tests/locale.test.mjs` | exit 0 — tests 5, pass 5, fail 0 |
| `npm run ui:typecheck` | exit 0 (`tsc --noEmit`) |
| `npm run ui:build` | exit 0 (only pre-existing `lib/data/mcp.mjs` turbopack tracing warnings) |
| `node scripts/aios-standards.mjs --root . --rule directoryEntries` | exit 0 — measured=1379 overBudget=56 exempt=28 baseline=28 blocking=0 |

## Files reviewed

- `apps/shell/ui/package.json` / `package-lock.json` — Lingui 6.6.0 deps (changed)
- `apps/shell/ui/src/i18n/locales.mjs`, `runtime.ts`, `provider.tsx`, `switcher.tsx`, `server.ts` (new)
- `apps/shell/ui/src/i18n/catalogs/{zh-CN,en,ja}.json` (new, 83 keys each)
- `apps/shell/ui/src/app/layout.tsx`, `src/proxy.ts` (changed)
- `apps/shell/ui/src/lib/console-navigation.ts`, `src/components/console/console-workspace.tsx`, `src/components/console/home-workspace.tsx`, `src/components/ui/states.tsx` (changed)
- `apps/shell/ui/tests/{i18n-catalogs,locale}.test.mjs` (new)

## Verdict

APPROVED — score: 1.0, complete: true, missing: [].

Note: full translation of secondary panels is a documented follow-up (see review artifact), not a failure of the accepted test scope.
