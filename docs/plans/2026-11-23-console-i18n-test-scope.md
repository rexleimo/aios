# Test Scope Contract — Console UI i18n

- id: `TSC-console-i18n-2026-11-23`

## User goal
Console UI serves en / zh-CN / ja. User can switch language without changing route URLs. All externalized UI strings render from Lingui catalogs.

## Non-goals
- Translating backend domain data files (`lib/data/*.mjs`, `lib/config/*.mjs`) that return Chinese operational messages; those stay source-language for this slice.
- Adding `[locale]` URL segments or changing Tauri deep links / legacy redirects.
- Replacing Lingui runtime with a macro/SWC compile pipeline.

## In-scope behaviors (observable assertions)
1. Catalog parity: for every key in the zh-CN source catalog, `en` and `ja` define a non-empty string; no extra keys in target catalogs.
2. Locale resolution: cookie value in `{en, zh-CN, ja}` resolves to itself; unknown/absent resolves to default `zh-CN`; `Accept-Language` with `en-US` resolves to `en`.
3. Active locale is reflected in `<html lang>` and the language switcher selection.
4. Switching locale changes rendered UI strings for externalized keys, with no navigation and no `ws=<key>` loss.
5. `npm run ui:typecheck` and `npm run ui:build` stay green.

## Out-of-scope behaviors
- Native OS menu / Tauri window title localization.
- Per-user server-side persistence of language preference (browser localStorage/cookie only).
- RTL layout (not required by en / zh-CN / ja).

## Allowed test seams
- `apps/shell/ui/src/i18n/catalogs/*.json` — data-only catalog files; a `node --test` test reads them directly (no framework needed).
- `apps/shell/ui/src/i18n/locale.mjs` — pure locale resolution helper, imported by proxy and provider; unit-testable with `node --test`.
- Public UI entry (manual smoke, documented in verification artifact): language switcher button in Console header.

## Completion criteria
- All three evidence items for this command recorded with real artifact refs.
- A RED test exists at a public seam before implementation (behavior-delta): catalog parity fails when target catalogs are absent.
- After implementation: parity test passes, typecheck passes, build passes.

## Acceptance test mapping
| behavior | assertion | seam |
|---|---|---|
| parity | key sets equal, no empty values | `node --test ...catalogs.test.mjs` |
| locale resolution | table-driven cases for cookie/header/default | `node --test ...locale.test.mjs` |
| switcher effect | `(a)` value before, `(b)` value after, `a !== b` | manual smoke + DOM lang check |
| build integrity | exit code 0 | `npm run ui:typecheck`, `npm run ui:build` |

## Negative clauses
No deleting/skipping assertions, no widening expectations, no mocking the catalog files to manufacture green, no claiming build success without recorded command output.
