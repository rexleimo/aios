# Standards + Spec review — Console i18n full coverage (TDD slice)

- kind: `rex.standards-spec-review.v1`
- fixedPoint: `HEAD` = `2b4febdf`
- diffRef: `diff:working-tree` (3 modified catalogs + 6 new test/doc files)
- specSources: `docs/plans/2026-11-23-console-i18n-full-coverage-test-scope.md`, `docs/plans/2026-11-23-console-i18n-full-coverage-testability.json`
- evidenceRefs: `receipt:622c5471-deb0-4b8a-b7b6-3c9663c5cd57`, `receipt:68c8d715-30d8-4e14-8602-5feafe75ba4b`, `receipt:84d1c0c4-0bf0-48d1-8f54-c8c8bd325102`

## Standards

Sources checked: root `AGENTS.md` (kebab-case, 8-entry directory budget, no manual `dist/` edits), `apps/shell/ui/AGENTS.md` (Next 16 local docs authoritative), `rex-engineering-standards` §1–§7. CRG `detect_changes` over 9 changed files: 0 changed functions, 0 affected flows, 0 test gaps, risk 0.00.

- Hard: none. `apps/shell/ui/src/i18n/` still has 6 entries; catalog JSON stays under `apps/shell/ui/src/i18n/catalogs/`, owned by the i18n module. New files use kebab-case.
- Judgement: new test `i18n-full-coverage.test.mjs` reads catalog JSON directly instead of calling `translate()`; this is the existing catalog-parity seam (cf. `i18n-catalogs.test.mjs`) and is acceptable for the RED/GREEN slice. Fix: when the full implementation lands, add a runtime assertion through `translate()` so the seam covers rendering too.
- Smell baseline (12): Mysterious Name 未见; Duplicated Code 未见 (3 keys repeated across catalogs are data parity, not logic); Feature Envy 未见; Data Clumps 未见; Primitive Obsession 未见; Repeated Switches 未见; Shotgun Surgery 未见; Divergent Change 未见; Speculative Generality 未见; Message Chains 未见; Middle Man 未见; Refused Bequest 未见.

## Spec

- Goal A1 (key resolves in all locales): present — 3 keys added identically to en/ja/zh-CN.
- Goal A3 (representative domain copy): present for 3 keys only; gateway / routing / resources each have one sampled string.
- Goal A2 (no hard-coded CJK in UI source): **not yet delivered** by this diff; deferred to implementation stage. This is the accepted boundary of the TDD slice, not a spec violation at this stage.
- Scope creep: none. No route, cookie, proxy or runtime seam changed.
- Test strength: RED receipt exit 1 with `actual=undefined expected='模型网关'`; GREEN receipt exit 0; focused suite receipt exit 0. No assertion deleted, skipped or weakened.

## Verdict

`pass-with-findings` for the TDD slice: 0 hard violations, 1 judgement finding (standards), 1 deferred scope item (spec). Full panel externalization and source guard remain outstanding and must not be claimed complete from this diff.
