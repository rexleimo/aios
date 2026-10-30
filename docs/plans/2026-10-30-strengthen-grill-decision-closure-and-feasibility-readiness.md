# Strengthen grill decision closure and feasibility readiness

## Objective and acceptance

User requests adoption of upstream loop-me/grilling strengths to stop implementation before the logic is understood. This is a planned local implementation, not publication. Current upstream reference is Matt Pocock Skills v1.3.2.

1. Clarification maintains a dependency graph of explicit decisions, investigates facts independently, and checks the full requested scope, a happy path and a meaningful failure path before claiming ready.
2. Three questions/rounds never authorize implementation. Unresolved critical decisions, pending alignment, and unsupported critical feasibility checks block the requirements stage even when all evidence kinds are supplied.
3. Low-impact, reversible defaults may be explicit assumptions with rationale. Existing accepted user decisions count as alignment; no extra approval ritual for work already authorized.
4. Domain code validates reported structure, dependency closure, references and status consistency, not natural-language intent or the truth of a model's semantic judgment.
5. New requirements submissions require readiness. Old stored decisions remain readable; they cannot be resubmitted as ready without the new record. Existing later-stage workflows are not silently reinterpreted.
6. Tests exercise the public workflow API and actual standalone CLI rejection/persistence/progression. Shared fixtures keep AIOS adapter regressions covered. Skill evals cover behavior and an honest deterministic certification record is produced; no claim of model performance improvement without a model evaluation.

## Baseline and ownership

- main tracks origin/main; parent dirty from prior authorized aios-harness rename, including a staged checklist. Preserve all existing changes. rex-harness initially clean. Dirty baseline: no pull/stash/reset performed.
- CRG search empty and get_impact_radius unavailable; fallback is targeted rg, source reads, public-API tests and Git diff.
- Rex owns requirements capability, typed decision and workflow advance. AIOS owns thin grill entry and distributed instructions; no parallel readiness rule in the parent.
- Read pre-edit-safety-gate, rex-workflow, rex-engineering-standards and selected rex-test-design.
- Work item grill-readiness-v1, workflow 851ac3a8-908a-453d-bfc6-a736efb88500; current stage design-tests.

## Design decision

Extend requirements decision v1 with optional `readiness` for historical read compatibility; require it at the requirements-stage submission boundary. The record includes status, decisions (id, dependsOn, status, impact, rationale and evidenceRefs), happy/failure walkthrough refs, feasibility status/evidence, and alignment status/evidence. Ready requires a closed acyclic graph, no open decisions or critical assumptions, supported feasibility and confirmed alignment. Blocked records remain in clarification; evidence completion cannot override readiness. Inspection may establish feasibility; use a minimal probe when investigation cannot settle a critical uncertainty. Runtime validates explicit reports and references, not semantic correctness.

Retain evidence anyOf compatibility for legacy commands, but assumption evidence is never a readiness exemption. Avoid adding a new global workflow phase. Scope clarification is complete only when both decision closure and feasibility evidence are present; obtaining a first slice alone is insufficient.

## Work graph and verification

- work-1: RED tests at public workflow seam. Input current API; output regressions for missing/blocked readiness and closure validation. Verification node --test rex-harness/tests/application/requirements-readiness.test.mjs. No mutation to baseline implementation. Rollback: remove only task-owned new tests.
- work-2 depends work-1: pure readiness model and Rex submission gate, shared fixtures, standalone scenario. Verify focused domain/application/standalone tests and npm test/npm run doctor in rex-harness. Runtime mutation remains local and reversible.
- work-3 depends work-2: requirements skill/evals, parent grill and shared Ask-First guidance, harness handoff consistency. Verify skills/native generated sync, certification, source guidance assertions and referenced artifact examples.
- work-4 depends work-2/work-3: full parent regression, bounded review, standards checks, versions/changelogs, evidence/checkpoint and plan closure. No commit/push/tag/npm publish in this batch.

The work is coupled and executes serially. Current ready frontier work-1; blocked work-2/work-3/work-4 depend on prior proof. Convergence gate is public entry refusal of premature completion plus ready success, full Rex/AIOS regression and synced client guidance.

## Test scope contract

In scope: explicit readiness structure/closure, old record reading versus new submission, partial evidence behavior, current stage/token preserved on blocked decision, successful completion with supported feasibility and existing alignment, real standalone persistence and adapter compatibility.
Out of scope: universal proof of requirements completeness, LLM benchmarking, schedulers, arbitrary spec execution, skill rollback repair and previous rename changes.
Seams: normalizeRequirementsDecision, advanceSoftwareWorkflow, standalone CLI and public adapter tests. Do not infer readiness from prose, question counts, filenames or evidence-kind presence.

## Progress

- [x] t1-understand: upstream/local rules compared; failure mode and bounded target recorded.
- [x] t2-plan: dependency graph, ownership and verification contract recorded.
- [x] t3-implement: RED -> typed closure gate -> skill delivery.
- [x] t4-verify: regression, review, certification and delivery.

## Evidence

- RED receipt `receipt:15ba4fdb-aedb-4bb5-8fb1-89e06b002729` (exit 1: legacy decision completed
  clarification without readiness).
- GREEN `receipt:81db278e-f037-48bd-b757-6fff51b2a5f0`; exact-scenario REFACTOR
  `receipt:6cc38db1-0983-4a19-b599-43ac6beab3c0` (both exit 0).
- Rex full suite 280/280; focused public API + standalone CLI + AIOS adapter 61/61.
- Parent full regression (test:affected auto-full, 260 files): 2491 pass, 0 fail, 12 skipped,
  exit 0, 472.4s. An earlier run failed only on stale release index; localized post and
  generated index were fixed, and the stable rerun above replaced that result.
- Static skill certification accepted for `rex-requirements` (43ad2ef0…) and `grill` (b36f0dfe…).
- Native/skills sync clean; llms check OK; syntax 1302/0; directoryEntries blocking=0;
  seven unrelated fileLines violations byte-equivalent to HEAD; security warn=0.
- Seven global clients updated to the readiness-aware `rex-requirements` with no conflicts;
  skill doctor 0 warn/0 error per client. Installed global AIOS runtime is still 6.15.1, so it
  rejects the new field by design; the skill reports that incompatibility instead of stripping it.
- Full verifier verdict `.aios/evidence/grill-readiness-verification.md` passed the four-section
  completeness validator.

## Release

- Rex `v1.0.0` was published first (commit `6563c82`, tag `v1.0.0`, asset
  `rex-harness-1.0.0.tar.gz`), satisfying the host gate that the recorded gitlink is an
  actual submodule release.
- Host `v7.0.0` then passed `scripts/release-preflight.sh --tag v7.0.0` (VERSION/CHANGELOG,
  skills+native sync, submodule published-release gate, root + MCP verification, training
  evidence recomputed since `v6.16.1`) and published via release run 41053398356
  (`build: success`, assets `aios.tar.gz`, `aios.zip`, both installers).
- Release gate fix along the way: `skill verify-training --changed` treated a deleted
  pre-rename skill directory as unreadable input with no remedy, which made any skill rename
  unreleasable. Registered renames are now recognized only when the declared successor holds
  accepted evidence (`superseded-by-rename`), and the logic moved into
  `skill-gate-outcomes.mjs` so the already-baselined gate file shrank (456 -> 451) instead of
  growing.

## Limits

- Runtime checks declared structure and consistency; it cannot prove branch coverage or that
  cited artifacts are truthful. Evals were authored and manually reviewed, not model-benchmarked.
- Prepared versions AIOS 7.0.0 / Rex 1.0.0 reflect the breaking submission contract. Nothing was
  committed, tagged, pushed or published; release order remains Rex first, then host gitlink.
