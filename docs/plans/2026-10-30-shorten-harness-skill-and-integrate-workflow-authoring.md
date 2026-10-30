# Shorten harness skill and integrate workflow authoring

> AIOS Planning Contract (schema v3)
> created: 2026-10-30T10:06:51.409Z
> client: pi
> source: mcp:aios_plan_start
> route: unknown

## Objective

Rename aios-long-running-harness to aios-harness through canonical skills and live consumers; integrate loop-me workflow-authoring and chief-of-staff decision briefs as host guidance without adding a Rex provider or promising unsupported runtime gates. type=implementation; targets=skill-sources/aios-long-running-harness, scripts/lib/tooling/components/skills, client-sources/native-base; allowedWrites=canonical host skill, catalog migration, live consumers, focused tests, docs, generated projections; failureClass=skill-name-migration

## Route skills

1. `Rex selects the current provider`

## Tasks

- [x] **t1-understand**: Confirm the short name and host workflow boundaries.
- [x] **t2-plan**: Record public-entry test scope and reuse existing owners.
- [x] **t3-implement**: Rename the canonical skill, migrate managed installs, and integrate upstream artifact handoffs.
- [x] **t4-verify**: Public-entry tests, full regression, projection checks, and bounded standards/spec review completed.

## Progress

- status: done

## Decision Log

- Canonical skill name: `aios-harness`; old name remains a catalog selection alias, not a second discoverable skill.
- Scope is host guidance and install compatibility, not scheduler/contract enforcement implementation.
- Guidance references are on-demand: native route -> harness skill -> integration reference; grill also points to the same reference.
- `workflow_type` is a workflow-authoring field, separate from model routing's `task-type`.
- Version impact: patch, v6.16.1 -> v6.16.2; no commit, push, tag or publication in this task.

## Acceptance

- `aios-harness` is the single canonical/discoverable harness skill; active host references use the short name.
- Selecting `aios-long-running-harness` through the existing skills catalog installs/selects the canonical short name.
- After a successful managed short-name install, an AIOS-owned legacy install is archived outside skill discovery. Unmanaged directories and new-name blockers are preserved.
- Existing sync retires managed old repository projections and generates the short-name skill for every declared surface.
- The skill defines an explicit input/output handoff for workflow authoring, execution, decision briefs, and improvement candidates; Rex retains Provider selection.
- Documentation distinguishes reusable workflow definitions, individual runs, human decision points, and recovery checkpoints; scheduling and contract enforcement are not claimed as new runtime features.

## Test scope contract

- User goal: shorter skill name plus usable integration of loop-me/chief-of-staff ideas into the existing workflow.
- Non-goals: new Rex capabilities, scheduler, autonomous skill edits, skill-workshop rollback fix, new wiki/database, publishing, or changing the submodule.
- In scope: catalog selection, install migration, generated projections, live host routing references, harness guidance and its evaluations.
- Public test seams: resolveCatalogEntries, installContextDbSkills, syncGeneratedSkills, and the existing native/no-injection contract suites.
- Smallest vertical slice: install the short-name skill by the old selector into an isolated client home; observe exactly one discoverable canonical install and a recoverable archive of the managed old install.
- Acceptance mapping: old/new selectors resolve to one entry; managed legacy copies/links are archived only after canonical installation succeeds; unmanaged legacy copies and canonical blockers survive; repeated installation is idempotent.
- Existing native and skill sync tests cover projected guidance and context/Rex ownership boundaries. Manual review and skill eval scenarios assess the workflow handoff text; textual checks do not prove runtime enforcement.
- Forbidden shortcuts: do not remove assertions, skip failures, substitute mock-only tests, or rewrite historical certification evidence.

## Baseline and ownership

- Branch main tracks origin/main. The only initial worktree change is this task's new plan; no pull, reset, or stash is performed on the dirty tree.
- CRG impact tools are unavailable in this session (tool search returned none); targeted rg, canonical source reads, and production-entry tests provide the fallback.
- Canonical host skill and installation/migration are parent-repository responsibilities. No Provider text or submodule change is needed.
- Rex work item: aios-harness-workflow-v1; current first Provider: rex-test-design.

## Next Actions

- Implementation and verification are complete. Commit/push/publication are outside this task.

## Verification evidence

- RED: `rex-harness receipt --root E:/coding/harness-cli -- node --test scripts/tests/foundation/skills/install/harness-rename.test.mjs` -> exit 1, 4 pass / 5 fail; receipt `4394069a-7459-495a-8f44-808cfd5bc583`.
- GREEN: same command -> exit 0, 9/9 pass; receipt `d8f3651c-d3bb-45b2-b356-edc4fdcc09b6`.
- `npm run test:affected` -> full regression fallback because scripts/test-suites.json changed; 260/260 files, exit 0; 2,491 pass, 0 fail, 12 skipped, 457,774 ms. Log: `D:/Temp/aios-harness-verification-20261030.log`.
- Focused migration/native/no-injection checks -> 25/25 pass; migration/native/no-injection/CI-wiring check -> 28/28 pass.
- Existing frontmatter/catalog/default-mode checks -> 26/26 pass.
- `node scripts/check-syntax.mjs` -> checked=1302 failures=0.
- `node scripts/aios-standards.mjs --root . --rule directoryEntries` -> measured=779 overBudget=24 exempt=24 blocking=0.
- Full-repository `--rule fileLines` -> 7 pre-existing violations, all verified unchanged from HEAD. No changed/new module introduces a line-budget violation.
- `node scripts/check-skills-sync.mjs` -> exit 0; `node scripts/check-native-sync.mjs --materialize-temp` -> native sync clean.
- `node scripts/doctor-security-config.mjs --json` -> exit 0, warn=0. The command emits text despite the supplied flag.
- Current-source `doctorContextDbSkills` for codex/claude/hermes/workbuddy/pi/zcode/qoder short-name installs -> all warnings=0, errors=0. The other clients are outside this skill's existing global catalog client list.
- `~/.aios/bin/aios doctor --json` -> exit 0 with warnings: installed runtime still has the old catalog and reports renamed skills missing/drifted, plus pre-existing PATH/client warnings. This is not used as evidence that the changed source is installed as a runtime update.
- `node scripts/generate-llms-txt.mjs --check` -> committed generated index matches v6.16.2.
- `git diff --check` -> clean.
- Six skill eval scenarios were updated and manually reviewed; no live model evaluation or training certification was run or claimed.
- Final focused receipt: `91454a6b-9d1a-423d-82b5-473e74b69d4a` (exit 0); exact TDD-scenario refactor receipt: `dacdceff-e7ac-49c2-a7f1-19baea86a5e0` (exit 0).
- Bounded review: `.aios/evidence/aios-harness-review.json` normalized through the public Rex API; both axes pass for this diff. Full verifier verdict: `.aios/evidence/aios-harness-verification.md`, completeness validator approved.
- Rex `aios-harness-workflow-v1`: status=completed, command=null, missingEvidence=[] (workflow activation `3fb72876-4e65-4b7a-898f-5e56a9f467db`).

Full regression output (`npm run test:affected`, automatic full regression fallback):

```text
[affected] mode=full 选中 260/260（改动 30 个文件，并发 4）
[affected] 套件入口/清单被改动：scripts/test-suites.json
ℹ tests 2503
ℹ suites 7
ℹ pass 2491
ℹ fail 0
ℹ cancelled 0
ℹ skipped 12
ℹ todo 0
ℹ duration_ms 457774.091
```

## Context candidate proposal

Codemap (snapshot 2026-10-14) proposed `scripts/tests/execution/aios-setup/aios-components.test.mjs`,
`scripts/aios-init.mjs`, and `scripts/lib/foundation/clients/selection/core/selection.mjs` for t3.
These remain proposed and unconfirmed; no context injection or delegated orchestration uses them.
This serial task does not depend on activating the candidates.

## Status

- status: done
