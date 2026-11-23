# Test diff review — Console UI i18n

No assertion was removed, skipped or weakened in the REFACTOR step.

- `i18n-catalogs.test.mjs` still asserts identical key sets across `zh-CN`/`en`/`ja` and non-empty string values. It is the same public catalog seam that produced the RED failure.
- `locale.test.mjs` adds four table-driven assertions for explicit choice, cookie precedence, regional `Accept-Language` mapping and default fallback.
- REFACTOR changes were limited to wiring (`provider.tsx`, `server.ts`, `proxy.ts`, component call sites); no test file was edited after GREEN.
- Green re-run after the build: `node --test apps/shell/ui/tests/i18n-catalogs.test.mjs apps/shell/ui/tests/locale.test.mjs` → 5 pass, 0 fail.
- `npm run ui:build` exits 0; emitted warnings are pre-existing dynamic-filesystem tracing notices from `lib/data/mcp.mjs`, unrelated to i18n.
