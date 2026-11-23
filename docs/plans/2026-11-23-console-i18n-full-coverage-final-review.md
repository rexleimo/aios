# Standards + Spec review — Console i18n full coverage (implementation)

- kind: `rex.standards-spec-review.v1`
- fixedPoint: `HEAD` = `2b4febdf`
- diffRef: `diff:working-tree` (78 changed files, +4245 / −1051)
- specSources: `docs/plans/2026-11-23-console-i18n-full-coverage-test-scope.md`, `docs/plans/2026-11-23-console-i18n-full-coverage-implementation-diff.md`
- evidenceRefs: `receipt:0e8aeb11-26bb-4fe0-a8ca-b191368c3139`, CRG `detect_changes` over 78 changed files (risk 0.65, 128 changed functions, 117 structural test gaps)

## Standards

Sources checked: root `AGENTS.md`, `apps/shell/ui/AGENTS.md` (Next 16 local docs authoritative), `rex-engineering-standards` §1–§7. Typecheck and build exit 0. `standards fileLines`/`directoryEntries` show no new violations from changed files; 2 pre-existing baseline drifts (`apps/shell/ui/src/lib/data`, `scripts/tests/tooling/shell/data`) are unrelated to this diff.

- Hard: none. Catalog data lives in the owning `src/i18n/catalogs/`; the shared `t.mjs` has a single responsibility (locale + catalog lookup); no new route, no new runtime dependency.
- Judgement 1: locale switch now reloads the page. Necessary because 123 labels are module-level constants evaluated at import; without reload they would stay in the old language. Trade-off: full reload instead of in-place re-render. Fix if desired: convert those constants to lazy getters in a later slice; no architectural change needed now.
- Judgement 2: AST codemod names non-identifier interpolation slots `value0`, `value1`… in ICU keys. Keys are stable and keys/values are mirrored in all catalogs. Fix: none required; readable enough for data keys.
- CRG 117 test gaps are structural (no tested caller found for changed React handlers); behavior is covered by the catalog/guard/runtime seams plus typecheck/build, not by per-handler unit tests. This is accepted for a UI-wide copy migration.
- Smell baseline (12): Mysterious Name 未见; Duplicated Code 未见 (catalog parity is data, not logic); Feature Envy 未见; Data Clumps 未见; Primitive Obsession 未见; Repeated Switches 未见; Shotgun Surgery 未见 (one owner, one seam); Divergent Change 未见; Speculative Generality 未见 (`t.mjs` has four real consumers); Message Chains 未见; Middle Man 未见 (runtime.ts re-exports for Lingui compatibility, not a pure forwarder); Refused Bequest 未见.

## Spec

- A1 (all keys resolve, non-empty, identical sets): present — 1100 keys in each locale, parity test green.
- A2 (zero hard-coded CJK outside catalog keys): present — source guard with empty allowlist passes.
- A3 (representative domain copy translated): present — gateway / routing / resources keys asserted in zh-CN/en/ja.
- A4 (locale switch, lang, cookie, routes): present — provider writes cookie then reloads; server layout sets locale before render; `locale.test.mjs` green; routes untouched.
- A5 (ICU placeholders): present — placeholders preserved by translation chunks; `interpolate.test.mjs` green.
- Non-goals honored: no backend payload retranslation, no MT service, no new dependency, no route change.
- Scope creep: none found.

## Verdict

`pass-with-findings`: 0 hard violations, 2 judgement findings (Standards), 0 Spec gaps. Findings are follow-ups, not blockers. Backend-returned payload strings remain out of scope per the accepted contract.
