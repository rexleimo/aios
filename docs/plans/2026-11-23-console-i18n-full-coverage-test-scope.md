# Test scope contract — Console i18n full coverage

- kind: `rex.test-design.scope.v1`
- workItemKey: `console-i18n-full`
- activationId: `f01376aa-b446-480f-9e33-336dc695e42d`
- capabilityId: `software.testing.design`
- date: 2026-11-23

## 1. User goal

Switching Console locale to `en` or `ja` currently leaves large areas of the
UI in source-language Chinese. The user wants **all UI-authored copy** in the
Console to be translated, not just the shell/navigation/home slice shipped in
`1cc21412`.

Known baseline: `docs/plans/2026-11-23-console-i18n-review.md` §25 records the
gap; `apps/shell/ui/src/i18n/catalogs/{zh-CN,en,ja}.json` contain 83 identical
keys and all 64 direct `t()` call sites resolve. The defect is un-externalized
literals, not missing catalog keys.

## 2. Non-goals

- No new routes, no `[locale]` URL segment, no change to cookie/proxy contract.
- No machine translation service, no network call, no new runtime dependency.
- No translation of raw payload data produced by the local CLI / backend
  (error text, command stdout, file paths, model IDs, provider proper nouns).
  Such values stay verbatim; they are data, not UI-authored copy.
- No change to backend CLI messages or to `.po`/Lingui macro toolchain.

## 3. In-scope behaviors

| id | Observable behavior | Assertion |
|---|---|---|
| A1 | Every `t(key)` used by UI source resolves to a non-empty string in each of `en`, `ja`, `zh-CN` | static catalog parity + key-resolution test |
| A2 | No UI-authored CJK literal remains in `apps/shell/ui/src/**` outside the i18n module and explicit data-passthrough allowlist | source guard test |
| A3 | Representative strings from gateway, model-routing, flows, resources and clients panels return the locale-specific text from `translate(locale, key)` | table-driven runtime test through the public `translate()` seam |
| A4 | Locale switch still drives `<html lang>`, cookie and server metadata; routes and `?ws=` deep links unchanged | existing `locale.test.mjs` + typecheck/build |
| A5 | Translations use ICU placeholders consistently; interpolation still fills `{count}` etc. for all locales | existing `interpolate.test.mjs` extended with new keys |

## 4. Out-of-scope behaviors

- Visual layout, component structure, plugin ecosystem copy outside Console.
- Translation quality review by a human native speaker (follow-up, not a gate).
- Re-translating the 83 already-covered shell keys beyond typo fixes.

## 5. Allowed test seams

1. **Static catalog guard** — `apps/shell/ui/tests/i18n-catalogs.test.mjs`:
   keep key-set parity, add "every source `t()` key exists and every value is
   non-empty in all three catalogs".
2. **Static source guard** — new `apps/shell/ui/tests/i18n-source-guard.test.mjs`:
   scan `src/**/*.{ts,tsx,mjs,js,jsx}` (excluding `src/i18n/` and comments) for
   CJK-bearing string/JSX literals; fail on any hit outside an explicit,
   reason-tagged allowlist. The allowlist starts with the current data-passthrough
   entries and must reach zero for UI-authored copy by completion.
3. **Public runtime seam** — `translate(locale, key, values)` exported from
   `src/i18n/runtime.ts`: a table-driven test asserts one representative key per
   domain yields the expected en/ja/zh-CN text.
4. **Toolchain seam** — `npm run ui:typecheck` and `npm run ui:build` from
   `apps/shell/ui` catch broken imports and bundle-time catalog problems.

Deleting assertions, skipping cases, widening the allowlist, or asserting only
mock objects is forbidden.

## 6. Completion criteria

- All three catalogs have identical key sets and no empty values.
- Source guard reports zero untranslated UI-authored literals (allowlist empty or
  containing only reason-tagged data passthrough approved in review).
- Focused tests: `node --test apps/shell/ui/tests/*.test.mjs` exit 0.
- `npm run ui:typecheck` and `npm run ui:build` exit 0.
- Existing route/workspace behavior unaffected (no new [locale] segment).

## 7. Decision refs

- `docs/plans/2026-11-23-console-i18n-verification.md` — accepted baseline evidence.
- `docs/plans/2026-11-23-console-i18n-review.md` §25 — documented follow-up gap.
- `apps/shell/ui/src/i18n/` — existing seam; reused, not replaced.
