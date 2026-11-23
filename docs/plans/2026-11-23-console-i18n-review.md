# Standards + Spec review — Console UI i18n

- kind: `rex.standards-spec-review.v1`
- fixedPoint: `HEAD` (8993d777)
- diffRef: `diff:working-tree` (non-empty; 8 modified files + `src/i18n/` + `tests/`)
- specSources: `docs/plans/2026-11-23-console-i18n-lingui-decision.md`, `docs/plans/2026-11-23-console-i18n-test-scope.md`
- evidenceRefs: `diff:working-tree`, `artifact:docs/plans/2026-11-23-console-i18n-implementation-diff.md`, `receipt:6cc57e59-81c8-47ed-b1ab-a21bd29bfb85`

## Standards

Repo sources checked: root `AGENTS.md` (path conventions, kebab-case, 8-entry directory budget, no manual `dist/` edits), `apps/shell/ui/AGENTS.md` (Next 16 local docs are authoritative; `proxy.ts` replaces `middleware.ts`), `rex-engineering-standards` §1–§7.

- `apps/shell/ui/src/i18n/` has 6 entries → within 8-entry budget. kebab-case naming used for all action modules. Hard: none.
- `console-workspace.tsx` is ~420 lines (was 413) against the ~400 soft budget. Judgement: file still owns one responsibility (console shell + panel routing); extraction into a panel module is a follow-up, not a defect introduced here. Fix: split `PluginPanelView` and the activity/settings sections into sibling components when that file is next touched.
- `console-navigation.ts` keeps Chinese `label`/`title` as a fallback alongside `labelKey`/`titleKey`. Judgement: source-language duplication with the catalog; acceptable while plugin views still supply raw strings. Fix: derive built-in labels solely from catalogs once plugin contributions also carry keys.
- Smell baseline (12 items): Mysterious Name 未见; Duplicated Code 未见; Feature Envy 未见; Data Clumps 未见; Primitive Obsession 未见 (locale is a validated string with a single resolver); Repeated Switches 未见; Shotgun Surgery 未见; Divergent Change 未见; Speculative Generality 未见 (`useT`/`useLocale` both have real consumers); Message Chains 未见; Middle Man 未见; Refused Bequest 未见.
- Toolchain: `node --test` (5/5 pass), `npm run ui:typecheck` exit 0, `npm run ui:build` exit 0, `node scripts/aios-standards.mjs --rule directoryEntries` blocking=0.

## Spec

- Decision "locales en + zh-CN + ja" — present: three catalogs, 83 identical keys, parity test green.
- Decision "routes must not change" — present: locale carried by cookie + `x-aios-locale`, no `[locale]` segment; Tauri deep links and `ws=<key>` untouched.
- Decision "reuse cached Lingui" — present: `@lingui/core`/`react` 6.6.0 installed, catalogs loaded via `setupI18n`; no macro/SWC transform added.
- Test scope "switcher changes rendered strings" — present: `LocaleSwitcher` in header, provider updates `<html lang>` and cookie.
- Gap (judgement): only shell/navigation/home surfaces are externalized so far. The secondary gateway / model-routing / flows panels still hardcode source-language strings. This is inside the declared non-goal boundary for backend data files but narrower than the full delivery ticket's work-3/work-4. Fix: continue domain-by-domain using the same catalogs and seam; no architectural change needed.
- No scope creep found: no new routes, no server-side persistence, no RTL work.

## Verdict

`pass-with-findings`: 2 judgement findings in Standards, 1 judgement gap in Spec, 0 hard violations. None blocks the current TDD cycle; the Spec gap is a follow-up slice.
