# Shell Shim Baked Root Guard — Standards & Spec Review

- Work item: `shell-shim-baked-root-guard`
- Date: 2026-09-18
- Stage: `software.review.standards-spec` / `review`
- Fixed point: `d7b884f1` (`git rev-parse HEAD`, verified)
- Command: `git diff d7b884f1 -- scripts/lib/components/shell.mjs scripts/tests/aios-components.test.mjs` (non-empty)

## Review scope (declared)

Reviewed files (this work item only):

- `scripts/lib/components/shell.mjs` (+40/-1)
- `scripts/tests/aios-components.test.mjs` (+91/-0)

Explicitly **excluded** from this review: a concurrent uncommitted change set
(`VERSION` 5.17.2, `CHANGELOG.md` PowerShell-GBK entry, four `.ps1` BOM edits,
`scripts/tests/aios-wrappers.test.mjs`) authored by another writer during this
work item. It is unrelated to this spec and must not be attributed to this diff.

Spec source: `docs/plans/2026-09-18-shell-shim-baked-root-guard-test-scope.md`
(user-approved objective: doctor detects a stale baked root; setup refreshes it;
ship as patch).

Standards source: `AGENTS.md` § "Coding Style & Naming Conventions" (no
`CODING_STANDARDS.md` / `CONTRIBUTING.md` in repo).

## Standards

Repo standards: 2-space indentation and semicolons — compliant
(`scripts/lib/components/shell.mjs:70-102`, `:442-450`). Consistent with the
existing Chinese-comment convention in this module. No hard violation found
(smell baseline is judgement-only by definition).

**Finding S1 — Speculative Generality (judgement).** `shell.mjs:88-94`
`expandShimRoot` substitutes four forms; two of them
(`$\{AIOS_ROOT_DIR\}`, `$AIOS_ROOT_DIR`) are never baked by any template in this
file (`buildPosixAiosLauncher` bakes a literal or `${HOME}`; the Windows
template uses `%AIOS_ROOT_DIR%`, handled elsewhere). Suggested fix: drop the two
`AIOS_ROOT_DIR` replaces, or add a case that actually needs them.

**Finding S2 — Duplicated Code (judgement).** `shell.mjs:89-93` — four
`.replace()` calls share one shape with only literal/constant differences.
Suggested fix: substitute from a small `{ HOME, AIOS_ROOT_DIR }` map in one
pass. (Not applied in REFACTOR: the generalization is wider than any test pins;
see `...-refactor-review.md`.)

**Finding S3 — Data Clumps (judgement).** `shell.mjs:88-100` — `{ env, homeDir }`
travels together through `expandShimRoot` → `shimBakedRootResolves`. Suggested
fix: only if a third consumer appears; otherwise leave.

Remaining smelts checked, no finding: Mysterious Name — `未见`;
Feature Envy — `未见`; Primitive Obsession — `未见` (a baked root is a path
string, a type would add nothing); Repeated Switches — `未见`; Shotgun Surgery —
`未见` (single file); Divergent Change — `未见`; Message Chains — `未见`;
Middle Man — `未见` (`shimBakedRootResolves` adds anchor resolution, not pure
forwarding); Refused Bequest — `未见`.

Worst Standards item: S1 (dead substitution surface).

## Spec

- B1 (doctor warns on stale baked root): implemented `shell.mjs:445-449`,
  asserted by `aios-components.test.mjs:564`. No gap.
- B2 (no false positive on a resolving root): implemented via the same branch,
  asserted by `:585`. Partial gap — see Finding P1.
- B3 (setup refreshes a stale shim): asserted by `:604`; **no new product code**.
  The rewrite already happens in `installNativeShims`; this cycle only makes the
  failure visible and pins the repair path. No scope creep.
- Scope creep: none in product code beyond S1's unused substitution forms.

**Finding P1 — Spec coverage gap (judgement).** Spec §6/§9 require coverage of
"a shim whose baked root resolves", and the real repaired machine shims bake
`${HOME}/.rexcil/aios` (`shell.mjs`-generated POSIX form). `:585` pins only a
literal absolute path; the `${HOME}` branch of `expandShimRoot` is verified by
the real-machine observation in the GREEN diff, not by the suite. Suggested fix
(future cycle, not this one): add a `${HOME}`-form fixture before changing that
branch again.

**Finding P2 — Spec/version drift (hard, process).** Spec §10 says "ships as
v5.17.2 (patch)". v5.17.2 was taken by the concurrent PowerShell change during
this work item, so this work item must ship as **v5.17.3**. Spec text needs the
version corrected before commit.

Missing spec items: none. Requirements implemented incorrectly: none found.

Worst Spec item: P2 (release version drift caused by concurrent writer).

## Summary

- Standards: 3 findings (S1, S2, S3), all judgement; worst = S1.
- Spec: 2 findings (P1 judgement coverage gap, P2 hard version drift); worst = P2.
- Neither axis is clean, but no finding blocks behavior correctness; P2 must be
  resolved before any commit.
