# Decision Ticket — Console UI i18n (Lingui)

- id: `DT-console-i18n-2026-11-23`
- workItem: `console-ui-i18n-lingui-2026-11-23`
- status: decided

## Decisions (locked with user)

1. Target app: `apps/shell/ui` — the Next.js 16 App Router Console shipped inside the desktop installer. `apps/desktop` contains only `dist/` output, no source.
2. Locales: `en`, `zh-CN`, `ja`. Source language is `zh-CN` (all current UI strings are Chinese).
3. Library: Lingui 6.6.0 (already cached in `apps/desktop/node_modules` with the full `@lingui/*` set + `pofile-ts` + `pseudolocale`). Reuse cached version for reproducibility.

## Rejected alternatives

- `next-intl`: best App Router DX, but user chose Lingui; no PO catalog workflow reuse.
- `[locale]` URL segments: would break Tauri deep links, legacy route redirects (`/prototype`, `/sessions`...), plugin-contributed `href`s and `ws=<key>` query handling. Locale carried by cookie + client context instead; routes stay unchanged.
- Lingui macros / `@lingui/swc-plugin`: not cached and adds compile-time transform risk on Next.js 16. Use Lingui runtime (`i18n._`, `<Trans id>`, `I18nProvider`) with domain-split catalogs; extraction can be layered later without changing the runtime API.

## Constraints

- Next.js 16 breaking changes: local docs under `apps/shell/ui/node_modules/next/dist/docs/` are authoritative. `middleware.ts` is deprecated → `proxy.ts` (already present).
- Cluster rule: one responsibility per file, ~400-line soft budget, kebab-case.
- Domain catalogs split by file (`locales/<locale>/<domain>.json`) so independent UI slices can be edited without writing the same file.
- Verification: `npm run ui:typecheck`, `npm run ui:build`, focused `node --test` for i18n modules, `aios standards check --rule directoryEntries`.
