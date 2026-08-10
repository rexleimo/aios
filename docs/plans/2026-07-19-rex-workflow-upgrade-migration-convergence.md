# Rex workflow upgrade migration convergence

> AIOS Planning Contract (schema v2)
> created: 2026-07-19T01:08:56.571Z
> client: cli
> source: aios plan start
> route: planned / rex-test-design

## Objective

升级到最新版 AIOS 后只启用 rex-harness 工作流；安全移除 AIOS 托管的
Superpowers 遗留投影与实现，并在 Rex 中补齐可由 AIOS 宿主执行的长运行交付
契约、迁移契约和回归验证。

## Route skills

1. `rex-test-design` (current Rex Command)
2. `verification-before-completion` (delivery gate)

## Tasks

- [x] **t1-test-contract**: Record the Rex-only migration acceptance mapping and
  public test seams — _Rex test-design evidence submitted_
- [ ] **t2-rex-contract**: Add the Rex long-running delivery contract, feature
  ledger, evidence transitions, and deterministic Rex scenarios.
- [ ] **t3-aios-reconciliation**: Add one idempotent, ownership-safe workflow
  surface reconciliation API and call it from every AIOS lifecycle entry.
- [ ] **t4-remove-legacy**: Remove AIOS Superpowers component/CLI/TUI/doctor/
  planning/loop-operation implementation and adapt affected client projections.
- [ ] **t5-verify**: Run focused and full regression, generated-skill sync,
  training, and agent-smoke evidence.

## Progress

- status: active

## Decision Log

- 2026-07-19: Rex is the sole owner of software workflow facts, Provider
  selection, activation stages, and promotions. AIOS remains the host for
  installation, client projections, harness execution, checkpoints, resume,
  and diagnostics; it must consume Rex Commands and promotions rather than
  define a competing workflow recipe.
- 2026-07-19: Use one idempotent Rex workflow-surface reconciliation API from
  installer post-install, `init`, setup, update, workflow preflight, and
  `doctor --fix`. This covers users who do not use `aios update`.
- 2026-07-19: Remove only legacy Superpowers projections that can be proved to
  be AIOS-managed (managed links or known managed copies). Never remove a
  user-owned same-name directory or the user's `~/.codex/superpowers` source
  checkout; report an actionable fail-closed conflict instead.
- 2026-07-19: Remove the Superpowers component, public CLI commands, wrappers,
  doctor gate, TUI component selection, planning projection implementation,
  and AIOS-owned competing workflow recipes. Do not merely hide or disable
  them.
- 2026-07-19: Do not add shallow `harness-engineering` or `loop-engineering`
  promotion modes. Extend the existing Rex adaptive workflow with a
  long-running delivery contract: initializer, acceptance/feature ledger,
  clean baseline verification, one feature per iteration, current Rex Command,
  evidence-driven progress, and explicit continue/retry/blocked/human-gate/
  completed decisions. AIOS starts bounded fresh-context iterations and returns
  host evidence; it never becomes a competing workflow controller.
- 2026-07-19: The bounded autonomy boundary is explicit: after the user starts
  `aios harness run`, AIOS may execute another iteration only while Rex returns
  `continue`; it stops for budget/no-progress/unsafe action/human gate and
  retains explicit stop and resume operations.

## Test scope contract

### User-visible acceptance mapping

| Required behavior | Public seam and regression coverage |
| --- | --- |
| Before development, the safety preflight pulls only a clean upstream worktree, refreshes CRG (or declares its fallback), and requires reuse-oriented design without blocking ordinary refactors. | `skills-frontmatter.test.mjs` observes the canonical skill contract, including `git pull --ff-only`, CRG fallback, abstraction/encapsulation/decoupling/directory ownership, and cohesive-batch verification. |
| A fresh install or upgrade exposes only Rex workflow skills and routes software work through Rex. | Lifecycle setup/update and recipe-registry tests assert Rex surface reconciliation, no Superpowers component, and no host-owned competing workflow recipe. |
| Existing AIOS-managed Superpowers projections are removed during migration. | The reconciliation API is exercised against managed links/copies and its removal report is asserted. Repeating it is a no-op. |
| A user-maintained same-name skill directory is not deleted. | Reconciliation returns an `legacy-workflow-conflict` outcome and leaves the directory untouched. |
| Users who install or bootstrap without `aios update` still converge. | Installer post-install, `init`, setup, update, workflow preflight, and `doctor --fix` all call the same reconciliation seam. |
| AIOS no longer ships Superpowers as a component, command, TUI selection, doctor gate, planning dependency, or independently installed workflow. | Component, CLI, lifecycle, doctor, planning, client-registry, and Ink TUI tests assert unsupported legacy inputs are absent or rejected and the remaining supported component model is shown. |
| AIOS no longer owns an independent loop-operation or `rex-loop-operator` control plane. | Agent catalogue/smoke/workflow tests assert the role and its routing have been removed while Rex remains the only software workflow controller. |
| Long-running delivery is classified and advanced by Rex while AIOS remains the bounded execution host. | Rex workflow scenarios observe the durable contract, initializer, one-feature ledger, baseline verification, current provider command, evidence transition, and terminal decisions; adapter/harness tests observe that AIOS executes the current command without replacing it. |
| Rex dispatch skills and all generated client projections describe the same Rex command chain. | Canonical skill contract tests and `sync-skills`/`check-skills-sync` observe a single shared workflow contract and no AIOS/Superpowers dispatch chain. |
| Chinese migration requests are not incorrectly completed without workflow facts. | Rex request-evaluation regression tests cover `升级`、`清理`、`移除`、`删除`、`补齐`. |
| TUI no longer presents Superpowers as a selectable component. | TUI option/default/preview tests assert the component model contains only the remaining supported components. |

### Test seams

- Safety: the canonical `skill-sources/pre-edit-safety-gate/SKILL.md`, observed
  through `scripts/tests/skills-frontmatter.test.mjs`; generated client roots
  are verified rather than edited directly.
- Rex: `deriveSoftwareFacts`, `decideNextCapability`,
  `startSoftwareWorkflow`/`advanceSoftwareWorkflow`, and
  `installClientProjection` contract tests. The added durable delivery-contract
  factory is a public domain seam, not a host runtime flag.
- AIOS: one exported workflow-surface reconciliation function injected into
  `runSetup`, `runUpdate`, installer post-install, init/workflow preflight, and
  `runDoctorSuite` so its effects and conflict report are testable in temporary
  roots without touching a user's home directory.
- Host execution: `evaluateAiosSoftwareRequest`,
  `startAiosSoftwareWorkflow`, `advanceAiosSoftwareWorkflow`, and the harness
  runtime observe Rex's current command and return evidence only.
- UI: the typed setup-option model and serialized setup/update/doctor previews,
  rather than keyboard cursor behavior alone.

### Non-goals

- Do not delete a user's standalone `~/.codex/superpowers` source checkout.
- Do not force-delete an unverified same-name directory or link.
- Do not introduce another AIOS loop or harness workflow recipe.
- Do not add a dependency or a third workflow framework.
- Do not edit generated `.codex/skills`, `.claude/skills`, or `.agents/skills`
  directly; change `skill-sources/` and synchronize them.

### Smallest independently failing vertical slices

1. A pure reconciliation test verifies managed removal, repeat no-op, and
   user-owned conflict before any lifecycle caller changes.
2. A pure Rex long-running contract scenario verifies its initializer and one
   feature/evidence transition before the AIOS harness consumes it.
3. One lifecycle integration test proves a non-`update` entry invokes the same
   reconciliation seam; the remaining entry points then reuse that seam.
4. CLI/TUI/doctor/agent deletion tests fail on a remaining public legacy
   surface, rather than asserting private imports or call counts.

These slices are sufficient because every required user-visible effect enters
through one of the stable lifecycle, Rex workflow, or rendered option seams;
they do not claim success from mocked internal calls alone.

## Acceptance

- Complete planned tasks and record verification evidence.

## Live Evidence Hardening Test Scope

### User goal

Prevent an AIOS agent or host script from self-attesting that a smoke run,
provenance record, compression metric, or SkillOpt admission is real when no
client process actually ran. A real smoke run must be observable as a managed
client invocation with an exit result, marker-bearing output digest, and
bidirectional metrics bound to the same session.

### Non-goals

- This local artifact format is not a cryptographic remote-attestation system:
  a user or root-level attacker who can rewrite the workspace can still alter
  files. The boundary here prevents AIOS code and agents from minting their own
  success evidence without executing the managed runner.
- Do not run paid or networked client smoke commands during unit tests.
- Do not promote every candidate agent or fabricate SkillOpt runs as part of
  this hardening slice.

### Acceptance mapping

| Observable behavior | Public test seam |
| --- | --- |
| A legacy `status: pass` agent smoke file plus standalone metrics and provenance cannot enable an agent. | `buildAgentCatalogue()` against an isolated evidence root returns `blocked` with smoke/metrics/provenance missing or invalid. |
| `aios agents smoke` cannot write trusted `pass`, `verified`, or compression evidence without an actual managed runner result. | `runAgentsCommand()` with a live request and no successful live-runner receipt records no trust-bearing artifacts and returns blocked. |
| A valid successful managed execution can be admitted only when its invocation identity, output digest, and both metric events share one client/agent/session binding. | Shared live-evidence validator tests and catalogue/capability report tests. |
| Legacy client `pass` JSON cannot unlock `skillTrainingAllowed`. | `buildClientCapabilityReport()` rejects v1/static client artifacts before readiness is considered. |

### Test seam and vertical slice

The stable public seams are the agent catalogue and client capability report;
they consume evidence from an isolated temporary workspace exactly as doctor
does. The first independently failing slice supplies the old files written by
`runAgentsSmoke()` to `buildAgentCatalogue()` and asserts that the projected
`rex-planner` remains blocked. This is sufficient to expose the bug because
the old writer's complete false claim (smoke + provenance + metrics) is the
same evidence path that controls live workflow admission. It does not assert
private call counts or replace a client process with a mock.

The shared evidence domain belongs under `scripts/lib/evidence/` rather than
either the agent or client directory: both consumers must apply one binding
rule and neither should own the other's execution policy. Client-specific
launching remains in `scripts/lib/clients/`; agent smoke orchestration remains
in `scripts/lib/agents/`.

### Live-evidence TDD RED observation

- Public entry: `buildAgentCatalogue()` as surfaced by `aios agents doctor`.
- Setup: an isolated temporary workspace contains the exact schema-v1 smoke,
  provenance, and metric files that the previous `runAgentsSmoke()` wrote
  without launching a client process.
- Expected: `rex-planner` stays `blocked-live`; static legacy artifacts cannot
  be promotion evidence.
- Actual: the new public-seam assertion observed `verification.status` as
  `verified` and failed.
- Failure reason: both agent and client admission trust status strings and
  unbound metrics rather than a managed execution receipt with one shared
  invocation/session identity.
- Command: `rtk node --test scripts/tests/ecc-agent-workflow.test.mjs`.
- Receipt: `receipt:400e4778-f8bd-42cd-93a0-86e4bb0afd27`.

### Live-evidence TDD GREEN observation

- Bounded implementation: added one shared `scripts/lib/evidence/live-execution.mjs`
  validator and made the agent catalogue require schema-v2 managed smoke,
  provenance, and same-session pre/post metric references as one evidence
  bundle. The legacy v1 files are therefore fail-closed.
- Reuse boundary: the validator is deliberately independent of agent catalogue
  policy so client capability admission can use the same contract in its next
  slice; it does not launch clients or grant workflow access itself.
- Exact command: `rtk node --test scripts/tests/ecc-agent-workflow.test.mjs`.
- Actual result: exit status `0`, 16 tests passed, including the new legacy
  self-attestation regression and a positive schema-v2 bundle case.
- Receipt: `receipt:b56ad730-f2e1-4547-afd8-081a22c3428f`.

## Current test-design evidence

- Worktree baseline: `main` tracks `origin/main`, but the worktree contains the
  known safety-gate changes and this plan. Per the preflight policy, no pull,
  stash, reset, rebase, force-pull, or discard is permitted.
- CRG MCP is unavailable in this client session. The fallback used project
  instructions, memo/unified search, targeted source/test search, local test
  seams, and `git diff`; no graph result is claimed.
- The current Rex Provider is `rex-test-design`; implementation and TDD RED
  wait for its three evidence kinds to be accepted.

## TDD RED observation

- Selected minimal behavior: a new installation's stable `planSetup()` public
  entry must not select or render the AIOS Superpowers component.
- Test input and precondition: `planSetup()` with no explicit options, before
  any lifecycle implementation change.
- Expected user-observable result: components are
  `browser,shell,skills,native`, and the setup preview contains no
  `superpowers` token.
- Exact command: `rtk node --test scripts/tests/aios-lifecycle-plan.test.mjs`
- Actual result: exit status `1`; 13 tests passed and the new test failed with
  actual components `browser,shell,skills,native,superpowers` versus expected
  `browser,shell,skills,native`.
- Failure classification: valid RED. The assertion is against the public
  lifecycle plan, and the failure is precisely the missing Rex-only default;
  it is not a syntax, fixture, environment, or unrelated dependency error.

## TDD GREEN observation

- Bounded implementation: removed `superpowers` from
  `createDefaultSetupOptions()` and `createDefaultUpdateOptions()` in
  `scripts/lib/lifecycle/options/defaults.mjs`. Explicit legacy component
  support, migration reconciliation, and public-surface deletion are not part
  of this slice and remain separate acceptance rows.
- Exact command: `rtk node --test scripts/tests/aios-lifecycle-plan.test.mjs`
- Actual result: exit status `0`; all 14 subtests passed, including
  `planSetup defaults to Rex-only workflow components`.
- Diff boundary: one lifecycle-defaults module and its stable public-plan test;
  `rtk git diff --check` also exited `0`.

## TDD REFACTOR observation

- Refactor decision: no additional abstraction. The setup and update defaults
  are explicit adjacent policy values; extracting a shared constant in this
  slice would expand the change without reducing a real caller boundary.
- Test-diff review: the assertion observes `planSetup()` components and its
  serialized preview. It neither asserts internal call counts nor weakens an
  existing condition, and it adds an explicit negative assertion for the
  removed legacy token.
- Exact verification: `rtk node --test scripts/tests/aios-lifecycle-plan.test.mjs`
  exited `0` with 14 passing subtests after the review.

## Specialist review scope

- Selected reviewer: `api-compatibility`, because changing setup/update
  defaults changes the public lifecycle and serialized CLI-preview contract.
- In scope: the `createDefaultSetupOptions`/`createDefaultUpdateOptions` diff,
  the public `planSetup()` assertion, explicit component callers, and whether
  the removed default can still accidentally invoke the legacy component.
- Out of scope for this narrow review: the later deletion/migration contract,
  which has not been implemented; performance, security, persistence, and TUI
  behavior have no changed-risk evidence in this slice.
- Required verdict format: cite the inspected diff/tests, report a severity,
  and state either a bounded fix or why no action is required.

## Specialist review verdict

- Verdict: `changes-requested` from the `api-compatibility` reviewer.
- High - `scripts/lib/cli/help/commands/basic.mjs` still presents
  `browser,shell,skills,native,superpowers` as the setup/update default, while
  the changed public plan uses four components. The next bounded fix must align
  both help entries; keeping an explicit legacy option temporarily is distinct
  from advertising it as the default.
- High - removing the default deliberately does not reconcile existing AIOS
  managed projections: `runUpdate` only reaches the old component when it is
  explicitly selected. The planned idempotent reconciliation API remains a
  final-acceptance blocker and must fail closed for user-owned paths.
- Medium - the changed update default lacks an equivalent public `planUpdate()`
  components/preview regression assertion. Add it before declaring this
  default-value slice complete.
- Low - rename the setup test to state what it actually observes (the lifecycle
  default omits Superpowers), or separately test Rex runtime preflight; the
  default-plan assertion alone does not prove the complete Rex runtime.
- Evidence: reviewer inspected the two changed files, lifecycle/CLI callers,
  and reran `rtk node --test scripts/tests/aios-lifecycle-plan.test.mjs` with
  14 passing subtests. The resulting action is bounded: correct help text and
  update coverage first, then implement the standalone reconciliation contract.

## Standards review

Checked scope: the current tracked diff in the safety preflight, lifecycle
defaults, and their focused tests, plus the public `setup --help` and
`update --help` output.

| Severity | Location and evidence | Impact | Action |
| --- | --- | --- | --- |
| High | `scripts/lib/cli/help/commands/basic.mjs:24,41` still renders `superpowers` in both default strings. Exact read-only commands `rtk node scripts/aios.mjs setup --help` and `rtk node scripts/aios.mjs update --help` reproduce it. | The documented CLI contract contradicts the actual setup/update plan. | Align both default help strings in the next GREEN slice. |
| Medium | `scripts/lib/lifecycle/options/defaults.mjs` changes both setup and update, but `scripts/tests/aios-lifecycle-plan.test.mjs` observes only `planSetup()`. | A later update-default regression can silently reintroduce the legacy component. | Add the equivalent stable `planUpdate()` components and preview assertions. |
| Low | `planSetup defaults to Rex-only workflow components` does not itself exercise Rex preflight; it exercises a lifecycle default and preview. | The name can overstate the evidence. | Rename it to describe Superpowers omission, or add a separate Rex-preflight test. |
| None | `skill-sources/pre-edit-safety-gate/SKILL.md` keeps one focused policy boundary without speculative code abstractions; its test checks the requested Git/CRG/maintainability language. | No duplicate implementation or style issue found in this part of the diff. | Retain; verify generated projections later in the planned skill-sync milestone. |

## Spec review

The original objective requires Rex-only fresh installations **and** safe
convergence for existing installations, including users who never run
`aios update`; it also requires removal of AIOS-managed Superpowers and
host-owned loop-control surfaces, while preserving user-owned paths.

| Severity | Missing or satisfied requirement | Evidence and impact | Action |
| --- | --- | --- | --- |
| High | Partially satisfied: fresh setup/update defaults now omit Superpowers. | The focused lifecycle test passes, but help output remains stale. | Complete the bounded help/update-test slice before accepting this partial behavior. |
| Blocker | Missing: safe, idempotent reconciliation of already-installed AIOS-managed Superpowers projections from installer, init, setup, update, preflight, and `doctor --fix`. | The changed default bypasses the existing Superpowers installer path; it does not inspect or clean old projections. | Implement the documented injected reconciliation API with managed-link/copy proof, no-op rerun, and fail-closed user-owned conflict tests. |
| Blocker | Missing: deletion of AIOS Superpowers component, public CLI/TUI/doctor/planning paths and the independent `rex-loop-operator` control plane. | Targeted source search still finds those active surfaces. | Remove them only after the reconciliation contract protects user-owned paths, with public-surface regressions. |
| None | Satisfied for this review: the safety preflight no longer requires per-edit approval and explicitly supports bounded TDD/refactors. | Canonical skill and `AGENTS.md` state the user's requested safe-pull, CRG fallback, reuse, abstraction, encapsulation, decoupling, and directory-ownership policy. | Preserve this contract during later workflow cleanup. |

Review verdict: `changes-requested`. No behavior has been falsely marked as
fully Rex-only; the known compatibility and migration gaps remain explicit
requirements for the next Rex-selected iteration.

## Rex reconciliation execution graph

Work item: `rex-only-workflow-reconciliation-2026-07-19`.

```text
A. Repair public default contract (help + planUpdate test)
   |
   +--> B1. Define managed-projection classifier and reconciliation result
   |         |
   |         v
   |       B2. Test idempotent removal / user-owned conflict / dry run
   |         |
   |         v
   |       C. Inject reconciliation into installer, init, setup, update,
   |          workflow preflight, and doctor --fix
   |         |
   |         v
   |       D. Delete Superpowers component, CLI, TUI, doctor, planning,
   |          client-capability, and loop-operator surfaces
   |         |
   |         +------------------+
   |                            v
E. Rex long-running delivery contract --> F. Rex/AIOS adapter and skill docs
                                     |  |
                                     +--+--> G. Generated projections and final verification
```

| Step | Input and completion condition | Dependency / safe failure point | Verification evidence |
| --- | --- | --- | --- |
| A. Public default contract | The four-component default is shown consistently by `planSetup`, `planUpdate`, and CLI help. Complete when no default string advertises Superpowers, while explicit legacy compatibility is still intentionally covered until D. | No dependency. If a public output differs, stop before migration/deletion and correct the contract. | Focused lifecycle/CLI tests plus `setup --help` and `update --help` output. |
| B1. Ownership-safe reconciliation boundary | Add one domain-owned classifier/result contract that recognizes only AIOS-managed links/copies and reports `removed`, `already-converged`, or `legacy-workflow-conflict`. Complete when it never resolves the user's Superpowers checkout as an AIOS target. | Depends on A only for the desired default. Unknown ownership or an unsafe target is a fail-closed conflict, not a deletion. | Pure temporary-root tests for managed link/copy, unknown directory, and `~/.codex/superpowers` exclusion. |
| B2. Idempotency and reporting | Apply B1 against the projected client roots. Complete when repeating reconciliation is a no-op and a report can be returned to every caller. | Depends on B1. Do not begin lifecycle injection while dry-run/report semantics are ambiguous. | Component/lifecycle regression with first-run removal, second-run no-op, and untouched user-owned directory. |
| C. Lifecycle convergence | Inject the same B API into installer post-install, init, setup, update, workflow preflight, and `doctor --fix`; non-fixing doctor only reports. Complete when all supported paths use the same seam without user-home mutation in tests. | Depends on B2. Any entry that bypasses the seam blocks D. | Lifecycle, doctor, CLI/init/preflight tests with injected fake reconciler and call/report assertions. |
| D. Retire legacy control plane | Remove AIOS Superpowers component, wrappers, CLI parsing/help/dispatch, TUI selection, doctor gate, planning/registry dependencies, and `rex-loop-operator`. Complete when no active AIOS route can install, select, or advance legacy workflow semantics. | Depends on C, so removal cannot strand existing managed projections. A remaining external/user-owned checkout is reported but retained. | Component/CLI/doctor/TUI/agent/workflow source and behavioral regression tests. |
| E. Rex long-running delivery contract | Add the durable Rex initializer, acceptance ledger, one-feature iteration, baseline verification, evidence decisions, and bounded autonomy contract. Complete when Rex chooses the current provider/next decision and AIOS has no independent loop controller. | Independent of B-D at source level; it shares final skill/documentation integration only. If host feasibility/evidence is missing, Rex returns blocked/human-gate rather than continuing. | Rex request/workflow scenarios and AIOS adapter/harness tests. |
| F. Dispatch documentation and projections | Consolidate workflow instructions around the shared Rex contract; reduce legacy long-running skill projections to a compatibility pointer and remove stale Superpowers routing. Complete when generated clients expose one Rex dispatch chain. | Depends on D and E. Never edit generated roots directly. | `sync-skills`, temporary materialization check, changed-skill training, and agent smoke. |
| G. Integration verification | Complete all user-visible acceptance rows, including no Superpowers default/entry, safe existing-user migration, Rex-only control semantics, and the safety preflight. | Depends on A-D and F; E is required for long-running acceptance. Any failed suite returns to its owning step, never to global deletion. | Root scripts test suite, Rex tests/doctor, MCP typecheck/test/build, source scans, skill verification, and agent smoke. |

Critical path: `A -> B1 -> B2 -> C -> D -> F -> G`; `E -> F -> G` is an
independent domain after the current planning stage. No implementation starts
from this plan until Rex selects its next Provider.

## Reconciliation work-item test scope contract

### User goal

Converge every supported AIOS installation path to the Rex-only workflow,
without deleting user-owned Superpowers content; remove AIOS's competing
Superpowers/loop control surfaces and give Rex, not the host, the durable
long-running delivery decision loop.

### In-scope observable behavior

1. `setup` and `update` public defaults and help advertise four default
   components and omit Superpowers.
2. An existing AIOS-managed legacy projection is reconciled once, reports its
   action, and is a no-op on the second run; an unproven path reports a
   conflict and remains intact.
3. Installer post-install, init, setup, update, workflow preflight, and
   `doctor --fix` reach the same reconciler; non-fixing diagnostics report but
   do not mutate.
4. AIOS no longer exposes any Superpowers component/CLI/TUI/doctor/planning
   route or independent loop operator, while Rex retains the active Provider
   command and long-running delivery ledger.
5. Canonical Rex dispatch instructions and generated client projections agree
   on one Rex command chain; the mutation safety preflight remains nonblocking
   for authorized TDD and refactoring.

### Explicit non-goals and exclusions

- Do not delete, rewrite, pull, or otherwise manage `~/.codex/superpowers` or
  any unproven same-name user directory.
- Do not add an external workflow framework, recreate an AIOS loop controller,
  or use a mode flag as a substitute for Rex's initializer/ledger/evidence
  contract.
- Do not use generated client skill roots as source code; do not use help-text
  snapshots, mocks, or private helper calls as the sole proof of migration.
- Do not claim an end-to-end user's home directory was changed; all destructive
  behavior is tested in isolated temporary roots with resolved ownership.

### Public seams and minimal slices

| Slice | Stable public seam | Independent expected failure and completion evidence |
| --- | --- | --- |
| Default contract | `planSetup`, `planUpdate`, and CLI `setup/update --help` | Fails if any default/preview/help text still advertises Superpowers; passes only when all three observable outputs agree. |
| Safe migration | exported reconciler result plus injected lifecycle calls | Fails on managed-copy/link removal, second-run no-op, or user-owned conflict independently; temporary roots make the effect observable without touching a real home. |
| Legacy surface retirement | CLI parsing/help, lifecycle option model, doctor report, typed Ink setup model, agent catalogue, and workflow definitions | Fails if a user can still select, invoke, or discover an AIOS-owned Superpowers/loop workflow surface. |
| Rex long delivery | `startSoftwareWorkflow`/`advanceSoftwareWorkflow` and AIOS Rex adapter/harness boundary | Fails if a current Provider is replaced by host looping, or if a feature advances without the Rex ledger/baseline/evidence decision. |
| Dispatch projection | canonical skill source followed by generated roots | Fails on a stale Superpowers dispatch instruction or a projection mismatch. |

The slices are sufficient because they observe the supported public lifecycle,
Rex workflow, and client-discovery boundaries. Internal helper call counts may
support diagnosis but cannot satisfy an acceptance row on their own.

## Workflow-surface reconciliation test scope

### User goal and bounded outcome

For pre-existing AIOS installations, safely remove only the legacy
Superpowers projections that AIOS can identify as managed, regardless of which
supported lifecycle entry the user uses. A clean or fresh installation must
remain Rex-only; a user-owned path must remain untouched and receive a clear
conflict report.

### Scope and stable seams

| Behavior | Public seam selected for testing | Completion criterion |
| --- | --- | --- |
| Update default remains converged | `planUpdate()` in the lifecycle plan API | Components and serialized preview match the setup four-component default. |
| Managed shared projection is removed | New exported `reconcileRexWorkflowSurface()` domain API, invoked with an isolated home map | An exact known managed link from `.agents/skills/superpowers` to the legacy source is removed and reported; the source checkout itself remains. |
| User-owned collision is preserved | The same API against a normal same-name directory or unknown link | It returns `legacy-workflow-conflict`, performs no removal, and exposes the path/reason to the caller. |
| Repeated migration is safe | A second call after managed removal | It reports `already-converged` and changes no path. |
| Every lifecycle entry converges | Injected reconciler dependency at installer post-install, init, setup, update, workflow preflight, and `doctor --fix` | Each entry calls the one API; non-fixing diagnostics do not mutate. |

### Ownership rule and exclusions

An exact legacy target path and destination is only a candidate clue, not proof
of AIOS ownership: the old installer wrote no ownership record and a user may
have created the same link. Automatic removal therefore requires a versioned,
trusted AIOS ownership ledger/marker on the projection. A historical unmarked
link, normal directory, unrecognized link, copy without AIOS-installed
metadata, or `~/.codex/superpowers` source checkout is outside the deletion set
and is a reported conflict or skipped result. This scope does not yet delete
the legacy public component/CLI/TUI/doctor/planning implementation, individual
Claude links, or the loop operator; those require a later contract after all
entry points use this safe seam.

### Independent test slices

1. Extend the existing lifecycle plan regression so `planUpdate()` independently
   observes the four-component public default.
2. Add a focused temporary-root reconciliation test module before adding a
   lifecycle caller: managed exact link removal, unowned collision preservation,
   source-checkout preservation, and second-run no-op must fail independently.
3. Only after slice 2 passes, add entry-point injection tests with a fake
   reconciler; these verify public lifecycle reachability without substituting
   mocks for the deletion behavior already proven in slice 2.

Focused verification: the lifecycle-plan test for slice 1; the new
reconciliation test for slice 2; affected lifecycle/doctor/CLI tests for slice
3. Any ownership ambiguity is a stop/report outcome, never a test fixture to
force-delete.

## Workflow-surface reconciliation TDD RED - managed link

- Selected behavior: the new public reconciler removes the exact legacy
  AIOS-managed shared link at `.agents/skills/superpowers` when it resolves to
  `.codex/superpowers/skills`, and preserves the linked source checkout.
- Input/precondition: a temporary home containing that exact symlink and a
  source marker; no real home path is read or changed.
- Expected result: status `removed`, the projection link is absent, and the
  source marker remains present.
- Exact command:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `1`; the sole test failed with
  `ERR_MODULE_NOT_FOUND` for
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`.
- Failure classification: valid RED. The absent module is the deliberately
  specified public domain seam for the missing migration behavior, not a test
  syntax, fixture, or environment failure.

## Workflow-surface reconciliation TDD GREEN - managed link

- Bounded implementation: added
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`. It derives
  only the historical shared projection and source paths, reuses
  `isManagedLink()` for real-path proof, removes only that projection link, and
  otherwise returns `already-converged` or `legacy-workflow-conflict` without
  deleting anything.
- Exact command:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `0`; the sole temporary-root test passed. The link
  was absent after reconciliation and the source marker under the legacy
  `.codex/superpowers/skills` checkout remained present.
- Diff boundary: one workflow-domain module and one behavioral test. It does
  not yet integrate lifecycle callers, classify legacy copies/individual
  Claude links, or remove any public legacy surface.

## Workflow-surface reconciliation TDD REFACTOR - managed link

- Refactor decision: no extraction or generalization. The historical source
  and shared-projection paths are the domain's explicit ownership boundary;
  turning them into a generic deletion utility would make it easier to widen
  the destructive scope accidentally.
- Test-diff review: the test creates the exact known symlink, invokes the
  exported domain API, observes the projection's absence, and observes the
  source marker's continued presence. It does not mock `rmSync`, inspect a
  private helper, or use an implementation call count as success evidence.
- Exact verification:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`
  exited `0` with 1 passing test after the review.
- Deferred behavior: a dangling or unrecognized link, an ordinary same-name
  directory, and a second invocation need their own RED tests so they cannot
  be silently classified as `already-converged`.

## Specialist review scope - reconciliation ownership

- Selected reviewer: `correctness-data`, because a migration that removes a
  path has data-loss, idempotency, and recovery risk.
- In scope: the new reconciler's exact-link proof, source-checkout
  preservation, report semantics, repeated execution, dangling-link handling,
  and user-owned collision boundary.
- Out of scope: lifecycle injection, individual Claude links/copies, public
  legacy-surface deletion, and Rex long-running delivery; none are implemented
  in this slice.
- Required verdict: cite source/test/command evidence, identify severity and
  actual destructive impact, and give a bounded next action. A passing
  managed-link test alone cannot waive an unsafe untested path.

## Specialist review verdict - reconciliation ownership

- Verdict: `changes-requested`; the current positive deletion path must not be
  integrated or described as safe migration evidence.
- High - real-path equality in `isManagedLink()` is not ownership proof. The
  old Superpowers installer created links but no AIOS ownership record, so a
  user-created identical link would be recursively deleted. Replace this rule
  with a trusted, versioned ownership ledger/marker; legacy unmarked links
  return a manual-migration conflict.
- High - `existsSync()` treats a dangling link as absent, returning
  `already-converged` while leaving its directory entry in place. Use `lstat`
  and classify dangling, unreadable, or unresolved paths as conflicts instead
  of absence.
- High - the temporary-root test passed only `homeDir` while the reconciler
  reads `process.env`. A configured `CODEX_HOME` or `AGENTS_HOME` could redirect
  it outside the fixture. Tests must pass `env: {}` and separately test explicit
  temporary env overrides before any destructive path is trusted.
- Medium - verification and `rmSync({ recursive: true })` are separated; a path
  replacement can turn link cleanup into directory deletion. Revalidate the
  entry with `lstat` immediately before `unlink`, and return conflict on a type
  change.
- Medium - add independent RED cases for second-run no-op, ordinary directory,
  foreign/dangling link, missing source, and source preservation. The current
  single positive test is insufficient to claim idempotency or fail-closed
  safety.
- Evidence: the reviewer ran
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`
  (1/1 passing) and inspected the reconciler, platform link predicate/paths,
  and historical installer ownership behavior. The passing test proves only
  the positive link-removal path, not safe ownership.

## Reconciliation TDD RED - help contract

- Selected behavior: the public `setup` and `update` help text must advertise
  the same four-component default already returned by their lifecycle plans.
- Input/precondition: `getCommandHelpText('setup'|'update')` before changing
  CLI help definitions.
- Expected result: each help text contains
  `default: browser,shell,skills,native)` and contains no Superpowers token in
  its default clause.
- Exact command: `rtk node --test scripts/tests/aios-cli.test.mjs`.
- Actual result: exit status `1`; 80 subtests passed and the new help-contract
  test failed because the setup output still contained
  `default: browser,shell,skills,native,superpowers`.
- Failure classification: valid RED. It is a precise public CLI documentation
  contract mismatch; no syntax, fixture, environment, or unrelated dependency
  failed.

## Reconciliation TDD GREEN - help contract

- Bounded implementation: changed only the default clauses for `setup` and
  `update` in `scripts/lib/cli/help/commands/basic.mjs` to
  `browser,shell,skills,native`. The explicit allowed-component list is
  intentionally unchanged until the ownership-safe reconciliation/delete
  slices retire that compatibility surface.
- Exact command: `rtk node --test scripts/tests/aios-cli.test.mjs`.
- Actual result: exit status `0`; all 81 subtests passed, including
  `setup and update help omit Superpowers from their default components`.
- Diff boundary: one CLI help module plus one public help-contract test; it
  does not claim to complete existing-user migration or legacy surface removal.

## Reconciliation TDD REFACTOR - help contract

- Refactor decision: no additional abstraction. The two help strings are
  adjacent command-specific presentation policy; a shared formatter would add
  indirection without a stable reuse boundary in this slice.
- Test-diff review: the test reads the exported command-help text used by the
  CLI, asserts the visible default, and rejects the stale token only within its
  default clause. It does not test private helpers, call counts, or loosen an
  existing behavior.
- Exact verification: `rtk node --test scripts/tests/aios-cli.test.mjs` exited
  `0` with 81 passing subtests after the review.
- Follow-up intentionally retained: add `planUpdate()` coverage and then start
  the ownership-safe reconciliation RED slice under a future Rex Command.

## Standards review - public-default repair

Checked scope: lifecycle defaults, the two changed help clauses, their focused
tests, and actual `setup --help` / `update --help` process output.

| Severity | Finding / evidence | Impact | Action |
| --- | --- | --- | --- |
| None | `rtk node scripts/aios.mjs setup --help` and `rtk node scripts/aios.mjs update --help` now each show the same four-component default as the changed lifecycle plan. `rtk node --test scripts/tests/aios-cli.test.mjs` passed 81/81. | The repaired public default contract has no observed drift. | Keep the direct command-help test. |
| Medium | `createDefaultUpdateOptions()` changed but no `planUpdate()` assertion yet protects its components and preview. | The update default can drift independently from setup/help. | Make this the next small test slice before treating default convergence as fully covered. |
| Low | The allowed-component list still includes `superpowers`. | This is deliberate temporary explicit compatibility, but must not survive legacy-surface retirement. | Remove it only after the reconciliation API protects existing managed projections. |
| None | The help test shares one loop for two identically observable commands and checks both positive and negative contract conditions. | No unnecessary helper or private implementation assertion is present. | Retain the compact form. |

## Spec review - public-default repair

| Severity | Requirement status | Evidence / impact | Action |
| --- | --- | --- | --- |
| Satisfied (partial objective) | Fresh setup/update defaults and their advertised CLI default no longer select Superpowers. | Lifecycle focused test and CLI help test/process output agree on four components. | Preserve as the first completed vertical slice. |
| Blocker | Existing users still require ownership-safe reconciliation, including non-`update` paths. | No reconciler or lifecycle injection exists in the current diff. | Continue at B1/B2/C of the execution graph. |
| Blocker | AIOS still exposes Superpowers component, CLI/TUI/doctor/planning surfaces and an independent loop operator. | The temporary explicit compatibility list is evidence that surface retirement has not begun. | Complete C before D; do not claim Rex-only completion early. |
| Blocker | Rex still lacks the durable long-running delivery contract and AIOS host boundary described in the user goal. | No Rex domain/adapter implementation is in the current diff. | Execute E independently before final projection/verification. |

Review verdict: `changes-requested` for the overall work item, with the
bounded public-default repair accepted as complete evidence rather than as a
substitute for migration, deletion, or long-running Rex semantics.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## Status

- status: active

## Rex standards and specification review - command 1ae3eedf-f438-4b06-bd22-9da97cfbe544

Reviewed the current bounded diff and the original Rex-only migration objective
independently under the `rex-code-review` provider. Scope: lifecycle default
and help changes, the new reconciliation module/test, their direct callers,
and the safety-gate policy. The review used the dirty local baseline (no pull
is safe), targeted source reads, `rtk git diff --check`, direct `setup` and
`update` help output, and:

```text
rtk node --test scripts/tests/aios-lifecycle-plan.test.mjs \
  scripts/tests/aios-cli.test.mjs \
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs
```

The command passed 96/96, but the positive reconciliation test is not enough
to establish its destructive-safety contract.

### Standards review record

| Severity | Location and evidence | Actual impact | Executable correction |
| --- | --- | --- | --- |
| Blocker | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:29-32` considers real-path equality a managed-link proof and calls `fs.rmSync(..., { recursive: true, force: true })`. The historical installer has no trusted AIOS ownership ledger, so a user can create the same link. | A user-owned link can be recursively removed; a path replacement between the check and removal can broaden the deletion target. | Replace equality-only ownership with a versioned, trusted AIOS marker or ledger. Before removal, re-`lstat` and `unlink` only the verified link itself. Treat every unmarked, dangling, unreadable, changed, or copied path as a conflict. |
| High | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:25` uses `existsSync`, which returns false for dangling links; the source can also be redirected by ambient `CODEX_HOME` / `AGENTS_HOME` because the test calls the API with only `homeDir`. | A dangling legacy entry is reported as converged while remaining installed, and tests can accidentally inspect a configured real client path rather than their fixture. | Use `lstat` to distinguish absence from a dangling entry. In every fixture use `env: {}` and add explicit temporary `CODEX_HOME` / `AGENTS_HOME` tests. |
| Medium | `scripts/tests/rex-workflow-surface-reconciliation.test.mjs` covers only one link-removal success case. | There is no regression boundary for idempotency, user-owned directories, foreign links, missing source, or source preservation after a conflict. | Start the next TDD slice with independent fail-closed cases before lifecycle injection; retain the no-op rerun and source-checkout checks as public behavior. |
| Medium | `scripts/lib/lifecycle/options/defaults.mjs:16-18` changes update defaults but `scripts/tests/aios-lifecycle-plan.test.mjs` currently asserts only `planSetup()`. | A future update-default or preview regression can reintroduce the legacy component undetected. | Add the equivalent `planUpdate()` components and preview test before accepting default convergence. |
| Low | `scripts/lib/lifecycle/options/constants.mjs:3` and setup/update help still list `superpowers` as an explicit selectable component. | The temporary compatibility surface remains discoverable and installable, so this diff cannot be described as a complete Rex-only installation implementation. | Retire the option, dispatcher, TUI, doctor, planning, and component implementation only after the safe reconciliation seam is injected. |

No new duplicate abstraction is warranted in the reviewed default/help slice:
the defaults remain adjacent lifecycle policy, and the reconciliation boundary
belongs in `scripts/lib/workflows/` once its ownership proof is corrected.

### Specification review record

| Severity | Requirement status and evidence | Actual impact | Executable correction |
| --- | --- | --- | --- |
| Satisfied (partial) | `createDefaultSetupOptions`, `createDefaultUpdateOptions`, `planSetup()`, and direct `setup`/`update --help` now advertise the four-component default. | Fresh default invocations no longer select the Superpowers component by default. | Preserve these focused regressions and add the missing `planUpdate()` assertion. |
| Blocker | Existing-install convergence is absent: the new reconciler is not called from installer post-install, `init`, `setup`, `update`, workflow preflight, or `doctor --fix`. | Users who do not run `aios update`, and existing users who do, retain legacy projections. | After the safe API's fail-closed tests pass, inject that single API into every listed entry with isolated-root lifecycle tests; diagnostics must not mutate without `--fix`. |
| Blocker | The current reconciliation implementation violates the requirement to preserve unproven user-owned content. | Shipping or wiring this module would create a data-loss migration path. | Do not integrate the current implementation; replace it with marker/ledger-gated link-only cleanup and actionable conflict reporting. |
| Blocker | Superpowers component/CLI/TUI/doctor/planning/client-projection paths and the independent loop-control implementation remain in the source tree, and Rex has no durable long-running delivery contract yet. | AIOS still owns a competing workflow surface, and long-running advancement cannot yet be driven solely by Rex facts, ledger, and evidence. | Complete the safe migration seam first, then retire the legacy surfaces and implement the Rex delivery contract with AIOS limited to bounded command execution and evidence return. |
| Satisfied (policy) | `skill-sources/pre-edit-safety-gate/SKILL.md` and `AGENTS.md` now make a clean-worktree `git pull --ff-only`, CRG refresh/fallback, reuse, abstraction, encapsulation, decoupling, and directory ownership explicit without per-edit approval. | The requested engineering guardrail no longer blocks authorized TDD or refactoring. | Synchronize generated client projections and run training/smoke at the final skill milestone. |

Review verdict: `changes-requested`. The passing tests verify only the bounded
default/help behavior and one unsafe positive migration path; they do not
authorize lifecycle integration, deletion, or completion of the Rex-only
objective.

## Safe reconciliation dependency graph - work item rex-safe-workflow-surface-reconciliation-2026-07-19

This work item is deliberately limited to a fail-closed reconciliation domain
contract. It does not inject lifecycle callers, delete legacy public surfaces,
or alter the user's Superpowers source checkout.

```text
S1. Freeze ownership and result contract
  |
  +--> S2. Write isolated RED safety scenarios
  |       |
  |       v
  |     S3. Implement ledger-gated inspection and link-only removal
  |       |
  |       v
  |     S4. Re-run all conflict/idempotency cases and document handoff
  |
  +--> U1. Add independent planUpdate default regression

S4 + U1 are prerequisites for the later lifecycle-injection work item.
They do not depend on one another, but both edit adjacent current test state,
so execute them sequentially rather than in parallel.
```

| Step | Input and completion condition | Dependency and fail-closed boundary | Verification evidence |
| --- | --- | --- | --- |
| S1. Ownership/result contract | Reuse the ledger pattern in `scripts/lib/aios-init/headroom-mcp/ownership.mjs`, but keep workflow-surface policy encapsulated in `scripts/lib/workflows/`. Define a versioned ledger under `AIOS_HOME` (default `~/.aios`) whose entry binds the exact projection path, expected source path, link identity/fingerprint, schema version, and creation time. Define only `removed`, `already-converged`, `legacy-workflow-conflict`, and `inspection-failed` results. | The old Superpowers installer wrote no ledger, so an unmarked historical match is unproven. It must be a conflict, not a candidate for deletion. No generic recursive-deletion helper is introduced. | Reviewable ledger schema/result table in the domain test and implementation; targeted source inspection proves the legacy installer lacks the record. |
| S2. Isolated RED safety scenarios | Replace the current one-case test with temporary roots that always pass `env: {}` or explicit temporary `CODEX_HOME`, `AGENTS_HOME`, and `AIOS_HOME`. Add independently failing cases for a ledger-owned link, second run, ordinary directory, unmarked exact link, foreign link, dangling link, missing source, corrupt ledger, and source-checkout preservation. | S1 defines expected results. No test may call a real home path or use ambient client-home variables. A conflict test must assert both the directory entry and source marker remain. | `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs` first fails for the asserted public result, not for fixture setup or module loading. |
| S3. Link-only implementation | Read and validate the dedicated ledger; inspect with `lstat` (not `existsSync`); validate the source and ledger-bound link target; immediately repeat the link/type check before `unlink`. Remove only the link entry with `unlink`, never `rmSync(..., { recursive: true })`, and never the source checkout. Remove or make retryable the ledger entry only after the link operation outcome is known. | Depends on S2. Any absence that is not a true `ENOENT`, non-link entry, dangling/unreadable target, source mismatch, ledger mismatch, or type change returns a non-mutating conflict/inspection failure. | The S2 suite turns green; `rtk git diff --check` is clean. The test observes the source marker after a successful removal and every conflict. |
| S4. Boundary verification and handoff | Re-run all scenarios after one process invocation has removed an owned link; a second invocation reports `already-converged`. Record that a legacy unmarked projection needs explicit user migration/cleanup rather than silent deletion. | Depends on S3. If a positive test passes only by omitting a safety case, return to S2 rather than integrating callers. | Focused reconciliation suite plus a written report of all status counts and no lifecycle import/caller diff. |
| U1. Update-default regression | Add a public `planUpdate()` components/preview assertion matching the already accepted `planSetup()` and command-help default behavior. | Independent from S1-S4. Keep it small; it must not claim to remove the explicit legacy option. | `rtk node --test scripts/tests/aios-lifecycle-plan.test.mjs`. |

Critical path: `S1 -> S2 -> S3 -> S4`; `U1` can complete before the later
lifecycle work but is intentionally kept sequential with S2 to avoid
overlapping edits. The future lifecycle work item may begin only after S4 and
U1 provide their stated evidence.

The dedicated ledger follows the existing Headroom ownership design for
versioning, absolute state-home resolution, fingerprint comparison, and
atomic persistence. It is not a claim that legacy paths are retroactively
owned: absent, malformed, or nonmatching ledger data produces a conflict. The
separate later migration UX must give users an explicit, recoverable route for
those conflicts; this work item will not silently clean them.

## Safe reconciliation test-scope contract - command f6069156-5085-45da-ad43-b63f23b4a014

### User goal

During any future AIOS lifecycle convergence, remove only a Superpowers
projection that AIOS itself can prove it created, while preserving the source
checkout and every unproven user-owned path. This bounded work item establishes
the public domain contract only; a later work item connects it to lifecycle
entry points.

### Explicit non-goals

- Do not infer ownership from a matching legacy target path, Git remote, or
  resolved real path alone.
- Do not remove `~/.codex/superpowers`, normal directories, copies, Claude
  plugin state, lifecycle callers, CLI/TUI surfaces, or the loop operator.
- Do not turn an unmarked conflict into an automatic deletion via a force,
  fallback, or ambient-environment code path.
- Do not use mocks, call counts, assertion removal, test skips, or relaxed
  result matching as the proof of filesystem safety.

### Acceptance mapping

| Acceptance behavior | Stable observation and assertion | Completion criterion |
| --- | --- | --- |
| A v1 ledger-owned shared projection is removed once. | Call exported `reconcileRexWorkflowSurface()` with isolated temporary `CODEX_HOME`, `AGENTS_HOME`, and `AIOS_HOME`; observe report `status: 'removed'`, `removed: [projection]`, `lstat` `ENOENT` for the projection, and the source marker still present. | The test proves link-only cleanup without touching the source checkout or a real client home. |
| Repeating the same reconciliation is harmless. | Call the same public API again against the same isolated roots and observe `status: 'already-converged'`, no removed paths, and preserved source marker. | The second invocation makes no filesystem mutation and does not call a legacy path “owned.” |
| An unmarked exact historical link is protected. | Create the same source/target symlink but no ledger entry; observe `status: 'legacy-workflow-conflict'` and use `lstat` to prove the link entry remains. | Real-path equality is explicitly insufficient for removal. |
| A directory or foreign link is protected even if a ledger exists. | Create a normal directory with a sentinel, and separately a link to another source; observe a non-mutating conflict with the sentinel/link entry intact. | Target type and target identity are verified, not assumed from the ledger. |
| A dangling link, missing source, corrupt ledger, unreadable/inspection error, or changed target is fail-closed. | Construct each temporary-root state and observe `legacy-workflow-conflict` or `inspection-failed`; use `lstat` so a dangling entry cannot appear absent. | No unsafe state is reported as `already-converged` or removed. |
| Environment selection is isolated and deterministic. | Pass `env: {}` for default-home tests and explicit temporary client/state homes for override tests; put a sentinel in the fallback home and prove the report references only the requested fixture. | Tests cannot inspect or mutate a developer's configured `CODEX_HOME`, `AGENTS_HOME`, or `AIOS_HOME`. |

### Test seams and allowed change boundary

- Primary public seam: exported `reconcileRexWorkflowSurface()` in
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`, because it
  is the future common lifecycle seam and it can exercise real temporary
  filesystem semantics without a user home.
- Filesystem observations: `lstat`, `readlink`/source marker reads, and the
  returned reconciliation report. `access` alone is prohibited for proving a
  dangling-link state.
- Ownership metadata seam: a dedicated versioned ledger in the temporary
  `AIOS_HOME`, following the established Headroom ledger's isolated state-home
  resolution and atomic write design. The test writes a valid v1 fixture
  explicitly; it never asserts a private helper call.
- Allowed implementation files for this vertical slice:
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs` and its
  focused test, plus this plan's evidence. `planUpdate()` coverage is a
  separate adjacent slice and does not widen the reconciliation behavior.

### Smallest independently failing vertical slices

1. Replace the existing equality-only positive test with an **unmarked exact
   link conflict**. It must fail against the present implementation because it
   currently removes that link, proving the new safety contract is meaningful.
2. Add the **ledger-owned link removal + source preservation + second run**
   scenario. It must fail until the domain understands the v1 ownership record
   and can remove only a verified link.
3. Add directory, foreign-link, dangling-link, missing-source, corrupt-ledger,
   and explicit-environment cases. Each must fail independently when a safety
   boundary is weakened and none relies on lifecycle injection.

These slices are sufficient because each observes the public report and actual
temporary filesystem state at the single future lifecycle boundary. They are
not substitutes for the later lifecycle-reachability tests, which remain out
of scope until this domain contract is safe.

### Completion rule

The focused suite may turn green only when every unsafe state remains present
and is reported as non-owned, the single ledger-owned link is removed by
link-only semantics, and a second invocation is a no-op. The earlier
pre-ledger “exact target removes” test is superseded and must not remain as a
success criterion.

## Safe reconciliation TDD RED - unmarked exact link

- Selected behavior: an unmarked legacy Superpowers projection remains intact
  even when its target is exactly the historical Codex source path.
- Input/precondition: the focused test creates a source marker and a matching
  `.agents/skills/superpowers` symlink in temporary explicit `CODEX_HOME` and
  `AGENTS_HOME` roots, supplies a separate temporary `AIOS_HOME`, and writes
  no ownership ledger.
- Expected user-observable result: the exported reconciliation API returns
  `legacy-workflow-conflict`, reports no removal, and leaves both the symlink
  directory entry and the source marker present.
- Exact command:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `1`; the only test failed at the public report
  assertion with actual `removed` and expected `legacy-workflow-conflict`.
- Failure classification: valid RED. The fixture is isolated and completed,
  the module loads, and the failure is precisely the unsafe equality-only
  ownership behavior identified by the review. No product implementation was
  changed in this stage.

## Safe reconciliation TDD GREEN - unmarked exact link

- Bounded implementation: removed the `isManagedLink()` real-path equality
  branch and its recursive `rmSync` deletion from
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`. A present
  legacy projection now returns the existing explicit
  `legacy-workflow-conflict` result; only an absent path returns
  `already-converged`.
- Exact command:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `0`; 1/1 test passed. The public report was a
  conflict, the projection remained a symlink, and the source marker was
  unchanged.
- Diff boundary: the reconciliation domain module and the focused public
  filesystem test. No lifecycle caller, Superpowers source checkout, CLI/TUI
  surface, or generic filesystem helper changed.
- Deferred behavior: this GREEN slice intentionally does not add ledger-owned
  removal, dangling-link inspection, corrupt-ledger handling, or lifecycle
  injection. `existsSync` still cannot distinguish a dangling link from an
  absent path, so no claim of complete reconciliation safety is made until the
  next selected RED/implementation slices cover it.

## Safe reconciliation TDD REFACTOR - unmarked exact link

- Refactor decision: retain the small explicit reconciliation branch. A shared
  deletion or link-classification helper would be premature until the v1
  ownership-ledger contract exists, and could obscure the fail-closed boundary
  that every present legacy projection is unproven.
- Test-diff review: the focused test calls the exported reconciliation API and
  observes its public report, the projected link entry with `lstat`, and the
  source-checkout marker. It does not assert helper calls, implementation
  types, or a mock-only result; the negative ownership constraint remains
  explicit.
- Exact verification:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`
  exited `0` with 1/1 passing. `rtk git diff --check` also exited `0`.

## Standards review - unmarked exact-link safety slice

Checked scope: the untracked reconciliation domain module, its focused
temporary-filesystem test, and the safe-reconciliation test-scope contract.
The review inspected the files directly because ordinary `git diff` does not
show untracked paths.

| Severity | Location and evidence | Actual impact | Executable correction |
| --- | --- | --- | --- |
| Blocker for the work item | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:22-24` uses `fs.existsSync`. A dangling projection returns `false` from that API, and unreadable inspection errors can also be collapsed into a negative existence result. | A legacy workflow entry can remain installed while the report says `already-converged`; the future lifecycle caller would have no actionable conflict. | In the next TDD slice, replace existence-only inspection with `lstat` plus explicit error classification. Treat dangling, unreadable, and changed paths as non-mutating `legacy-workflow-conflict` or `inspection-failed`. |
| Blocker for the work item | No versioned ownership ledger is read or validated, and the module has no link-only owned-removal branch. | The current implementation is safe only because it cannot remove a projection; it cannot yet meet the approved migration requirement for AIOS-proven projections. | Add a dedicated AIOS_HOME v1 ledger and a RED/GREEN test for a ledger-bound link, source-marker preservation, and a second no-op invocation. Recheck the link identity immediately before `unlink`; never introduce recursive removal. |
| None within this slice | The present-path branch returns a structured conflict without resolving the link target or touching the source checkout; `scripts/tests/rex-workflow-surface-reconciliation.test.mjs` observes the report, `lstat`, and source marker. | The selected unmarked exact-link behavior cannot delete a matching user-created link. | Retain this narrow fail-closed branch while the ledger scenarios are added. |

No duplicate abstraction, naming, or directory-ownership issue was found in the
bounded current slice. The separate workflow domain remains the appropriate
home for the future ledger-backed policy.

## Specification review - unmarked exact-link safety slice

| Severity | Requirement status | Evidence / impact | Next action |
| --- | --- | --- | --- |
| Satisfied (partial) | An unmarked historical link is not inferred to be AIOS-owned merely because its target matches. | The public API returns `legacy-workflow-conflict`; the focused test proves both the link entry and the source marker remain. | Preserve this assertion in all later ledger and lifecycle tests. |
| Blocker | Ledger-owned link removal, idempotent second-run behavior, source-missing/corrupt-ledger states, foreign links, directories, and dangling links are not yet implemented or tested. | The accepted test scope requires all of these public filesystem observations before any lifecycle injection can safely begin. | Return to `rex-test-design` for the next independently failing ledger-owned scenario, then broaden the fail-closed cases. |
| Out of scope, still required later | Installer, init, setup, update, workflow preflight, and `doctor --fix` have not been connected to the reconciler; Superpowers/loop-control deletion has not begun. | This slice deliberately changes no caller and therefore cannot converge users who install through another path. | Do not start deletion; first complete the pure reconciliation contract, then add lifecycle reachability tests under a new Rex Command. |

Review verdict: `changes-requested` for the active safe-reconciliation work
item. The current narrow behavior is correct, but it is not sufficient to
claim a complete or lifecycle-ready migration.

## Ledger-owned reconciliation test-scope contract - command 8ac4dda3-5a5f-4062-a7d5-2dd9b8aae611

### User goal and bounded scope

Implement the remaining pure workflow-surface reconciliation contract: AIOS
may remove exactly one historical Superpowers projection only when a valid v1
AIOS ownership record proves the expected projection/source/link relationship.
The operation must preserve the source checkout, use link-only removal, be
idempotent, and fail closed on every ambiguous filesystem or ledger state.

This command does not inject lifecycle callers, remove a public Superpowers
component/CLI/TUI/doctor/planning surface, clean any unmarked historical link,
or delete the standalone `~/.codex/superpowers` checkout. It does not create a
generic filesystem deletion abstraction or use mock call counts as evidence.

### Ownership ledger boundary

The workflow domain owns a dedicated JSON ledger under the resolved
`AIOS_HOME`, separate from Headroom's integration ledger. Its v1 record is
written by a future AIOS-managed projection installer and contains a schema
version plus an entry that binds all of the following exact values:

- the absolute `.agents/skills/superpowers` projection path resolved from the
  supplied `AGENTS_HOME` or fallback home;
- the absolute `.codex/superpowers/skills` source path resolved from the
  supplied `CODEX_HOME` or fallback home;
- `entryType: 'symlink'`, the exact link target text, and a deterministic
  fingerprint over the schema, projection path, source path, entry type, and
  target text;
- an AIOS ownership marker/version and creation timestamp.

The reconciler must treat a missing, malformed, wrong-version, mismatched, or
unreadable record as unproven ownership. It reads the ledger before deciding,
uses `lstat` to distinguish absence from a dangling entry, validates the
source and recorded link target, then immediately repeats the link/type/target
inspection before `unlink`. It removes only that link entry. It clears or
updates the ledger only after the unlink outcome is known, so the next call is
an observable no-op. No recursive deletion API is permitted.

### Acceptance mapping

| Acceptance behavior | Public observation | Completion criterion |
| --- | --- | --- |
| A valid v1 ledger-owned shared link is cleaned once. | In an explicit temporary `CODEX_HOME`, `AGENTS_HOME`, and `AIOS_HOME`, call `reconcileRexWorkflowSurface()` and observe `status: 'removed'`, the projection in `removed`, `lstat` `ENOENT` for that path, and an unchanged source marker. | Cleanup used `unlink` on the projection, not the source checkout or a directory. |
| A second call is harmless. | Call the same public function again with the same fixture; observe `already-converged`, an empty removal list, and the source marker still present. | The final converged state does not classify a missing projection as a legacy conflict or mutate it again. |
| Unmarked or ledger-mismatched paths remain protected. | Preserve the existing exact-link test and add mismatched-ledger coverage; use `lstat` and source/sentinel reads after the report. | Matching real paths alone, copied ledger data, or a nonmatching record never authorize removal. |
| Directories, foreign links, dangling links, missing sources, corrupt ledgers, unreadable paths, and a target changed before unlink all fail closed. | Each temporary-fixture case observes `legacy-workflow-conflict` or `inspection-failed` and proves the original directory entry, foreign/dangling link, or sentinel remains. A deterministic filesystem barrier may change a real fixture link between the first and final inspection; it may not substitute a mocked unlink result. | No ambiguous state returns `removed` or silently reports `already-converged`. |
| Home resolution is deterministic. | One test uses `env: {}` and an isolated fallback home; another supplies all three explicit temporary homes. Both reports reference only fixture paths. | No test can read or mutate a developer's ambient client or AIOS home. |

### Test seams and vertical slices

- Primary public seam: `reconcileRexWorkflowSurface()`; assertions must use
  its report and real temporary filesystem state, not private helper calls.
- Allowed code/test boundary: the reconciliation module, its focused test, and
  this evidence plan. The existing atomic-write utility and the Headroom
  ledger's isolated `AIOS_HOME` resolution are reusable patterns, not a reason
  to couple the two domains.
- First RED/GREEN slice: a valid ledger-owned link is removed, the source
  marker remains, and the second call is a no-op. It independently fails
  against the current conflict-only implementation.
- Second safety slice: retain the unmarked-link regression and add directory,
  foreign-link, dangling/source-missing, corrupt-ledger, target-change, and
  environment-isolation cases. Each must fail if its own safety boundary is
  weakened.

The focused suite is complete only after all table rows pass. Lifecycle
injection and public-surface deletion remain separate later Rex work items.

## Ledger-owned reconciliation TDD RED

- Selected behavior: a valid v1 ledger-owned Superpowers projection is removed
  by the public reconciler exactly once, while the source checkout remains and
  the second public invocation reports convergence.
- Input/precondition: the focused test creates a real source marker and an
  absolute projected symlink in explicit temporary `CODEX_HOME` and
  `AGENTS_HOME` roots. It writes the specified v1 ledger fixture under a
  separate temporary `AIOS_HOME`; no ambient home is consulted.
- Expected user-observable result: first report `removed` with the projection
  path and an absent projection entry; second report `already-converged`; the
  source marker remains after both calls.
- Exact command:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `1`; the existing unmarked-link test passed, and
  `reconciliation removes one ledger-owned link and is idempotent` failed at
  its public report assertion with actual `legacy-workflow-conflict` and
  expected `removed`.
- Failure classification: valid RED. The ledger, source directory, symlink,
  and test module all exist; the asserted failure is exactly the missing
  ledger-owned cleanup behavior, not fixture setup, syntax, or infrastructure.

## Ledger-owned reconciliation TDD GREEN

- Bounded implementation: the workflow-domain reconciler now resolves a
  dedicated v1 `AIOS_HOME/workflow-surfaces/rex-workflow-projections.json`
  ledger, derives the expected Codex source and Agents projection from the
  supplied environment, and verifies the schema, ownership marker, exact
  paths, entry type, target text, and deterministic fingerprint.
- Link-only safety: it uses `lstat` rather than `existsSync`, requires a
  source directory, re-inspects the same symlink identity and target directly
  before `fs.unlink`, and removes only the projection link. A missing,
  malformed, mismatched, non-link, source-unavailable, unreadable, or
  changed-path state returns a non-mutating conflict or inspection failure.
- Ledger state: after a successful unlink, the atomic-write helper removes the
  consumed entry. A later public call observes an absent projection and
  returns `already-converged`; a ledger-update failure is reported explicitly
  with the completed removal rather than hidden.
- Exact command:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `0`; both the unmarked-link protection regression
  and the ledger-owned removal/idempotency test passed (2/2). `rtk git diff
  --check` also exited `0`.
- Diff boundary: the reconciliation domain module, its focused public
  temporary-filesystem test, and this evidence plan. No lifecycle caller,
  Superpowers source checkout, public component/CLI/TUI/doctor surface, or
  generic recursive-deletion utility changed.

## Ledger-owned reconciliation TDD REFACTOR

- Refactor decision: retain the small domain helpers for ledger resolution,
  fingerprint validation, link inspection, source inspection, and atomic
  ledger update. They encode different ownership decisions; a generic
  filesystem-delete or reusable "owned file" abstraction would hide the
  Superpowers-specific source/projection boundary before any second caller
  exists.
- Test-diff review: both tests call only the exported reconciler. They assert
  structured user-facing reports and real `lstat`/source-marker observations:
  the unmarked link remains, while the valid owned link disappears exactly once
  and the next call converges. No test asserts helper calls, mocks `unlink`,
  removes an assertion, skips a case, or relaxes a result expectation.
- Exact verification:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`
  exited `0` with 2/2 passing. `rtk git diff --check` also exited `0`.

## Correctness-data specialist review - ledger-owned reconciliation

- Reviewer and risk scope: `correctness-data`, selected for migration,
  persistence, idempotency, and data-loss risk. Reviewed only the reconciliation
  module, its focused temporary-filesystem tests, and the approved ledger test
  contract; it made no code changes.

| Severity | Location and evidence | Actual impact | Required next action |
| --- | --- | --- | --- |
| High | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:39-46,77-92,104-110` fingerprints only schema/path/type/target text. `sameLink()` proves a link is unchanged during the current call, not that it is the same link AIOS created. | A valid old ledger can authorize removal after a user replaces the original AIOS link with a new same-target link. | Bind and validate a creation-time link identity in the ledger, using a portable representation of `lstat` device/inode metadata. Add a real fixture that replaces the ledger-recorded link with a same-target link before reconciliation and expects a conflict. |
| High | `scripts/tests/rex-workflow-surface-reconciliation.test.mjs` has only unmarked-link and positive-owned-link cases, while the approved contract also lists directories, foreign links, dangling links, missing sources, corrupt/unreadable ledgers, changed targets, and both fallback/explicit home resolution. | Fail-closed behavior is not yet protected against regression; the domain is not ready for lifecycle injection or legacy-surface deletion. | Continue in reconciliation-only mode. Add every unsafe state as an independent public filesystem assertion, beginning with same-target replacement. |
| Medium | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:147-155` checks immediately before `unlink`, but a pathname race remains between that check and the unlink. | Link-only deletion protects the source checkout and directories, but a concurrently replaced user link could still be removed. | Add the planned deterministic changed-before-unlink fixture; evaluate a documented per-home lifecycle lock or explicitly retain the bounded concurrent-writer limitation. |
| Medium | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:128-130,158-165` reports unlink-success/ledger-write-failure, then a retry returns converged without repairing or surfacing the stale record. | A failed persistence transition can become invisible and leave an inconsistent ledger. | Specify and test stale-owned-entry recovery: repair a matching consumed record or continue returning a ledger-repair failure until durable. |
| Low | `selectOwnedEntry()` does not validate `createdAt`, despite the approved v1 record requiring a creation timestamp. | A syntactically incomplete record can be treated as owned. | Require a valid creation timestamp and cover malformed entry data. |
| Positive | The current path uses `lstat`, validates source/target/fingerprint, rechecks before removal, calls `unlink` only, and preserves the source marker in both focused cases. | This is materially safer than the prior realpath plus recursive-delete design. | Retain these assertions while expanding negative cases. |

Specialist verdict: `changes-requested`. Do not inject lifecycle callers or
remove any legacy workflow surface until the high-severity ownership and
test-scope gaps are closed and re-reviewed.

## Standards review - ledger-owned reconciliation

Checked scope: the current reconciliation module and its two public
temporary-filesystem tests. The focused command
`rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`
exited `0` with 2/2 passing; this is evidence for the stated two cases only.

| Severity | Location and evidence | Actual impact | Executable correction |
| --- | --- | --- | --- |
| High | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:39-46,77-92` hashes stable textual fields but not the link identity captured at ledger creation. `sameLink()` at lines 104-110 only compares the two observations in the current invocation. | The code cannot distinguish AIOS's original link from a user replacement that has the same target string and paths. | Extend the v1 entry and fingerprint with creation-time `lstat` identity; reject an entry unless the current link matches it. Add a real same-target replacement test before lifecycle integration. |
| High | `scripts/tests/rex-workflow-surface-reconciliation.test.mjs:18-102` covers two rows while the approved contract includes several fail-closed conditions. | Directories, foreign or dangling links, missing source, corrupt/unreadable ledger, changed target, and both home-resolution variants can regress unobserved. | Add each condition as an independent public filesystem test; do not substitute helper-call assertions or mocked unlink results. |
| Medium | `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs:158-165` removes a link before persisting ledger consumption, but a retry of an absent path exits before inspecting/repairing a failed update. | A partially completed persistence transition is not recoverable or diagnosable on a later call. | Define and test an absent-projection stale-ledger rule before caller integration. |
| Low | `selectOwnedEntry()` does not check the documented `createdAt` field. | An incomplete record is accepted as ownership evidence. | Validate a parseable creation timestamp as part of entry validation and add malformed-ledger coverage. |
| None | The module is correctly located in the workflow domain, uses the existing atomic-write utility rather than duplicating it, and contains no generic recursive-delete helper. | Current code follows repository ownership and reuse expectations for the bounded positive path. | Preserve this separation while adding missing checks. |

## Specification review - ledger-owned reconciliation

| Severity | Requirement status | Evidence / impact | Next action |
| --- | --- | --- | --- |
| Satisfied (partial) | An unmarked exact historical link is retained, and an isolated ledger fixture can authorize `unlink` of one matching symlink without touching the source checkout. | Both behavior-level focused tests pass and inspect real filesystem state. | Retain both tests as non-regression cases. |
| Blocker | The required ownership proof is incomplete because it does not bind the original link identity; the full fail-closed acceptance table is also not implemented. | The user goal prohibits deleting an unproven user-owned path, including one that replaces an earlier AIOS link. | Start a new TDD slice for creation identity and same-target replacement, then add remaining unsafe-state cases. |
| Blocker | Lifecycle convergence for users who install through setup/init/installer/preflight/doctor, and removal of Superpowers/loop surfaces, have not started. | The current pure domain API has no callers by design and cannot yet affect installed users. | Keep caller wiring and legacy-surface deletion blocked until the full reconciliation contract and specialist re-review pass. |

Review verdict: `changes-requested`. The bounded positive path is safer and
tested, but it does not yet satisfy the safe-migration specification.

## Link-identity reconciliation minimal-construction record - command 821d58cd-8647-4708-853a-734a106a7ab5

### Reuse ladder

1. **Remove the requirement? Not applicable.** Making every present projection
   a conflict would avoid deletion but would fail the user requirement to
   converge AIOS-proven projections without a manual operation.
2. **Reuse existing repository code? Partially.** Reuse the existing
   `writeFileAtomic()` utility and the established absolute `AIOS_HOME`
   resolution pattern. Do not reuse the Headroom ownership module directly:
   its normalized command-config fingerprint and object-shaped ledger do not
   model a symlink's creation identity or workflow-surface policy.
3. **Use the standard library? Applicable.** Node's `fs.lstat()` with
   `{ bigint: true }` exposes exact device/inode values, `readlink()` exposes
   target text, and `unlink()` retains link-only deletion semantics. Store the
   creation identity as decimal strings so JSON is portable without losing
   64-bit precision.
4. **Add a dependency? Not applicable.** Filesystem identity, JSON parsing,
   SHA-256, and atomic persistence are already provided locally; a lockfile or
   migration framework would add coupling without proving ownership against a
   non-cooperating user writer.
5. **Use one local expression? Not sufficient.** Repeatedly formatting and
   comparing `BigInt` identity, timestamps, ledger fields, and recovery states
   inline would obscure the fail-closed ownership decision and make the test
   fixture contract hard to audit.
6. **Minimum new construction.** Keep local workflow-domain helpers and add
   only a `linkIdentity` record (`device`, `inode`, and `mode` decimal strings),
   a valid `createdAt` check, and a fingerprint that includes those fields.
   A link is owned only when its current `lstat` identity, path, source, target,
   marker, timestamp, and fingerprint all match the ledger record.

### Minimal recovery and concurrency policy

- A valid matching owned entry with an absent projection is a recoverable stale
  ledger state: atomically remove the consumed entry, then report
  `already-converged`. If that repair cannot persist, return
  `inspection-failed` rather than hiding the inconsistency.
- An old ledger entry without creation identity or a malformed timestamp is
  unproven and remains a conflict. This is fail-closed and needs no migration
  of historical unmarked links.
- A pre-invocation same-target replacement is deterministically rejected by
  comparing its current identity with the ledger's creation identity. The
  existing final `lstat` comparison remains a best-effort guard against a
  concurrent pathname replacement during this invocation; portable pathname
  APIs cannot make a non-cooperating external writer atomic with `unlink`.
  Later lifecycle callers may serialize cooperating AIOS operations with a
  per-home lock, but that is not a substitute for identity validation and is
  out of this pure-domain slice.

### Chosen next test boundary

The first new public filesystem test retains an original ledger-owned link at
a different name, recreates the managed path as a same-target symlink, and
expects `legacy-workflow-conflict` with the replacement and source marker
intact. Retaining the original link prevents inode reuse and gives a
deterministic creation-identity mismatch. Adjacent tests then cover malformed
identity/timestamp entries and an absent-path stale-ledger repair; all remain
isolated temporary-home tests and do not mock `unlink`.

## Link-identity reconciliation test-scope contract - command 545da383-4790-4c14-b1ae-ee23f4e4f6a9

### User goal and non-goals

Strengthen the pure reconciliation domain so only the exact symlink originally
recorded by AIOS can be removed. Every replacement, incomplete record,
filesystem ambiguity, or persistence-recovery failure must be observable as a
preserved conflict or inspection failure. This work remains entirely below
lifecycle integration: no setup/update/init/installer/preflight/doctor caller,
Superpowers component/CLI/TUI implementation, loop operator, generated skill,
or source checkout may change.

### Acceptance mapping

| Acceptance behavior | Stable public observation | Completion criterion |
| --- | --- | --- |
| A same-target replacement is not considered the original AIOS link. | Create an owned link and ledger, rename the original link aside, recreate the managed path to the same source, then call `reconcileRexWorkflowSurface()`. Observe `legacy-workflow-conflict`, the replacement link remains by `lstat`, the original retained link remains, and the source marker is unchanged. | The mismatch is based on stored/current creation identity, not merely target text or a timing race. |
| An incomplete or corrupted ownership record is unproven. | Create matching links with an identity-less record, invalid `createdAt`, bad fingerprint, bad JSON, or an invalid schema; observe a conflict or `inspection-failed` and retain the link/source marker. | Every required v1 field is validated before deletion. |
| An absent projection with a matching stale owned ledger is recovered durably. | Remove the projection externally while retaining a valid ledger, call the public reconciler, observe `already-converged`, then read the on-disk ledger and prove the consumed entry is absent. | A later invocation does not hide a stale ledger after an interrupted post-unlink persistence step. |
| Non-link and unresolved states fail closed. | In separate fixtures create a directory sentinel, an external link, a dangling matching link/source-missing path, and a parent path that produces inspection failure; observe a non-removal report and prove each entry/sentinel remains. | `lstat` distinguishes absence from a dangling or invalid directory entry. |
| Resolution is isolated. | Run a fallback-home fixture with `env: {}` and a separate explicit `CODEX_HOME`/`AGENTS_HOME`/`AIOS_HOME` fixture; reports and filesystem assertions reference only their temporary roots. | No test or code path relies on developer-machine environment state. |

### Test seam and vertical order

- Public seam: only `reconcileRexWorkflowSurface()` plus its returned report
  and actual temporary filesystem/ledger contents. Fixtures may calculate the
  documented JSON fingerprint and identity record but may not mock internal
  inspection or unlink helpers.
- Existing positive-owned and unmarked-link tests remain mandatory regression
  cases. The first RED adds the same-target replacement case; it fails until
  creation identity is persisted and validated.
- The second slice adds malformed-entry and stale-ledger recovery. The third
  adds directory, external/dangling/source-missing, inspection-error, and both
  environment-resolution cases. Each case must independently preserve the
  relevant directory entry or source marker.
- A final review documents the remaining unavoidable non-cooperating writer
  race between final pathname inspection and `unlink`; no test may claim that
  a mocked or unrelated lock makes that race impossible.

## Link-identity reconciliation TDD RED - same-target replacement

- Selected behavior: a recreated managed symlink with the same source target
  as the ledger record remains user-owned unless its creation-time identity
  matches the original AIOS-recorded link.
- Input/precondition: the focused fixture creates a source marker and original
  managed link, records its BigInt `lstat` identity in a valid ledger fixture,
  renames that original link aside, then creates a new managed-path symlink to
  the same source. Keeping the original link prevents inode reuse.
- Expected user-observable result: `legacy-workflow-conflict`, no removal, and
  both link entries plus the source marker remain.
- Exact command:
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `1`; the existing two cases passed, while
  `reconciliation preserves a same-target replacement of a ledger-owned link`
  failed with actual status `removed` and expected
  `legacy-workflow-conflict`.
- Failure classification: valid RED. The fixture uses actual links, exact
  ledger paths, and real `lstat` observations. The failure is the missing
  creation-identity check, not a test setup or runtime error.

## Link-identity reconciliation TDD GREEN - same-target replacement

- Implementation: `inspectLink()` now obtains BigInt `lstat` metadata and
  records the symlink's device, inode, and mode as decimal strings. The
  ownership fingerprint binds that identity and the required `createdAt`
  timestamp; `selectOwnedEntry()` rejects malformed timestamps, malformed
  identities, and a current link whose identity differs from the ledger.
- Boundary preservation: removal remains `unlink()` of the managed symlink
  only. An unmarked link, an incomplete ledger record, or a same-target
  replacement remains a conflict; neither this slice nor its tests touch the
  Superpowers source checkout.
- Regression fixture: the positive owned-link fixture now stores the original
  link identity. The replacement fixture retains the original link under a
  different name before recreating the managed pathname, preventing inode
  reuse and proving the rejection is identity-based rather than timing-based.
- Exact verification: `rtk node --test
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs` exited `0` with
  3/3 passing, including `reconciliation preserves a same-target replacement
  of a ledger-owned link`. `rtk git diff --check` also exited `0`.
- Scope decision: this proves only the first link-identity slice. Lifecycle
  callers and all Superpowers/loop-surface removal remain blocked until the
  remaining fail-closed acceptance cases and review are complete.

## Link-identity reconciliation TDD REFACTOR - behavior-preserving review

- Refactor decision: no production refactor was made. Link identity has one
  explicit representation at the filesystem boundary and one equality helper;
  extracting a generic ownership or filesystem-deletion abstraction would
  hide the workflow-specific proof requirements without a second caller.
- Test-diff review: all three fixtures invoke only
  `reconcileRexWorkflowSurface()` and inspect real temporary filesystem state.
  The positive case verifies link-only removal and source preservation; the
  legacy and replacement cases verify non-removal. No assertion uses internal
  helper calls, mocks unlinking, skips a case, relaxes an expected conflict, or
  rewrites an expected value to match the earlier unsafe removal.
- Exact verification: `rtk node --test
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs` exited `0` with
  3/3 passing. `rtk git diff --check` exited `0` for tracked edits; the
  inspected untracked source and test files contain no whitespace errors.

## Link-identity reconciliation standards review - identity slice

Reviewed scope: `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`
and its three public temporary-filesystem tests, against the repository's
workflow-domain ownership, `lstat`/link-only safety, atomic-write, and focused
test conventions. This review makes no code changes.

| Severity | Location and evidence | Actual impact | Required action |
| --- | --- | --- | --- |
| High | `reconcileRexWorkflowSurface()` returns `already-converged` for an absent projection at lines 159-161 before reading the ledger. The approved acceptance table requires a valid stale owned ledger to be consumed durably after an interrupted post-unlink ledger write. | A stale record remains invisible after a later retry, so persistence recovery is not yet safe to place behind lifecycle callers. | Add a public absent-projection stale-ledger fixture, atomically consume only a matching valid entry, and report `inspection-failed` if that repair cannot persist. |
| Medium | The new `createdAt` and `linkIdentity` validation at lines 88-123 is not yet covered by malformed-record fixtures. The approved contract also requires bad fingerprints/JSON/schema, directories, external or dangling links, missing sources, inspection errors, and home-resolution isolation. | Future changes can weaken fail-closed behavior without a regression signal. | Add independent public filesystem tests for every remaining acceptance row before lifecycle wiring. |
| Medium | The final check at lines 182-188 narrows but cannot atomically close the pathname replacement race with a non-cooperating writer. | A concurrent replacement immediately after the final `lstat` can still be unlinked. The source checkout and directories remain protected by link-only unlinking, but a user link can be affected in that bounded race. | Retain the identity recheck; document the limitation and, when a lifecycle caller is introduced, evaluate a per-home lock for cooperating AIOS writers without claiming it protects against all external writers. |
| None | Lines 39-149 keep ledger fingerprinting, identity validation, source inspection, and atomic ledger update in the workflow domain; line 188 uses `unlink()` rather than recursive deletion. Tests at lines 48-165 use the exported public function and actual filesystem state. | The identity slice adds no duplicate framework, hidden host coupling, or unsafe source-checkout deletion path. | Preserve this boundary. |

Standards verdict: `changes-requested`. The completed identity fix is clear and
appropriately local, but the pending recovery and fail-closed test matrix block
caller integration and any legacy-surface deletion.

## Link-identity reconciliation specification review - identity slice

Original specification evidence is the migration objective, safety decision
log, and link-identity acceptance table above.

| Severity | Requirement status | Evidence and impact | Required action |
| --- | --- | --- | --- |
| Satisfied | A same-target replacement is not treated as AIOS's original projection. | The fingerprint includes `createdAt` and creation identity; the current link must match it. The real fixture renames the original link aside, recreates the managed path, and observes `legacy-workflow-conflict` while both links and the source marker remain. | Retain this test as a non-regression case. |
| Blocker | Incomplete/corrupt ownership proof and stale-ledger recovery are not fully implemented or tested. | Identity-less/malformed timestamps, corrupt ledger data, source and link ambiguity, and the durable absent-projection recovery acceptance rows remain unverified; the early absent return currently violates the stale-ledger row. | Finish the remaining pure reconciliation slices and repeat specialist review before lifecycle integration. |
| Blocker | Fresh/existing-install convergence and removal of AIOS Superpowers/loop-control surfaces remain unimplemented. | No setup/update/init/installer/preflight/doctor caller invokes this isolated API, and no public legacy surface was deleted in this slice. This is intentional scope containment, not completion of the user objective. | Keep the API caller-free until ownership proof reaches the approved fail-closed contract, then add one lifecycle seam at a time and test non-`update` routes. |
| Satisfied | The changed implementation does not delete the user source checkout or an unproven same-name projection. | Both conflict fixtures keep the real symlink and the `source-marker.txt`; removal is reachable only after a matching ledger, source, and creation identity check. | Preserve fail-closed behavior for all new states. |

Specification verdict: `changes-requested`. The TDD slice fulfills its narrow
same-target replacement behavior, but it is not yet eligible for lifecycle
injection or for deleting Superpowers and loop-engineering surfaces.

## Workflow-surface fail-closed recovery dependency graph

Work item: `rex-workflow-surface-recovery-2026-07-19`. Scope remains the pure
reconciliation API and its temporary-home public tests. No lifecycle caller,
installer, Superpowers/loop surface, or generated skill is an input to these
steps.

```text
R1 stale-owned-ledger recovery (critical path)
   |
   +--> R2 malformed/corrupt ownership proof
   |
   +--> R3 filesystem ambiguity and unavailable source
   |
   +--> R4 fallback and explicit-home isolation
                \       |       /
                 +------v------+
                    R5 review
                       |
                       v
          separate future lifecycle-integration work item
```

| Step | Input and completion condition | Dependency / safe failure point | Verification evidence |
| --- | --- | --- | --- |
| R1 - stale-ledger recovery | A valid ledger entry has the original identity, but its managed projection was removed before the previous ledger update. Reconciliation atomically consumes only that matching entry, returns `already-converged`, and leaves no stale entry. A write failure returns `inspection-failed` rather than hiding the record. | First implementation slice; it changes the current early-absent return. On any ambiguous ledger, source, or write result, stop with a non-removal report. | Public temporary-filesystem RED then GREEN in `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`, plus read-back of the ledger contents. |
| R2 - ownership-record rejection | Identity-less/invalid-identity entries, invalid `createdAt`, bad fingerprint, bad JSON, and invalid schema keep the managed link and source marker intact while reporting conflict or inspection failure. | Depends only on the shared ledger fixture shape, not R1 semantics; execute sequentially because R1/R2 edit the same module and test file. | Same focused command; each fixture observes the exported function, real link, source marker, and report. |
| R3 - filesystem ambiguity | A directory sentinel, foreign or dangling link, missing source, and an inspection-error parent path never cause removal. | Independent of R1/R2 behavior but shares the same public API and test file. Do not mock `unlink` or assert private helpers. | Same focused command with one isolated temporary-home fixture per state. |
| R4 - home resolution isolation | A fallback `env: {}` fixture and explicit `CODEX_HOME`/`AGENTS_HOME`/`AIOS_HOME` fixture operate only beneath their temporary roots. | Independent behavior, sequenced after R3 to reuse the verified fixtures without speculative test utilities. | Same focused command and assertions on reports/paths under each fixture root only. |
| R5 - gate review | R1-R4 are green, no public test weakens the acceptance table, and remaining concurrent-writer limitations are documented. | Requires all four public evidence sets. A `changes-requested` verdict retains the caller/deletion block. | Focused test command, `rtk git diff --check`, standards/spec review artifact, then the Rex evidence transition. |

Critical path is R1 -> R5: durable recovery is the only current behavior that
can silently hide an interrupted removal. R2-R4 are behaviorally independent
but remain sequential implementation batches because they share one ownership
module and fixture file; this avoids concurrent edits and preserves a clear
TDD evidence trail.

## Stale-ledger recovery minimal-construction record

Current bounded behavior: when `managedProjection` is absent, consume a stale
ledger entry only if the entry itself is a complete, fingerprint-valid AIOS
record for the resolved projection and source paths. This operation removes
only AIOS ledger metadata; it does not inspect, unlink, rename, or recurse into
the missing projection path or the Superpowers source checkout.

1. **Remove the requirement? Not applicable.** Returning `already-converged`
   without inspecting the ledger hides the interrupted post-unlink transition
   that R1 exists to repair.
2. **Reuse existing repository behavior? Applicable.** Reuse `readLedger()`,
   `selectOwnedEntry()` field/fingerprint validation, `removeLedgerEntry()`,
   and its existing `writeFileAtomic()` persistence boundary. Extend entry
   selection with an optional current-link identity: present links require the
   identity match; an already-absent projection has no current identity to
   compare and validates the recorded identity's shape plus the signed record.
3. **Use the standard library? Already covered.** Atomic writing is delegated
   to the existing filesystem utility. No new `fs` primitive or direct ledger
   write is necessary.
4. **Add a dependency? Not applicable.** JSON, SHA-256, and atomic persistence
   already exist in this domain; a migration or lock dependency would not add
   evidence for a metadata-only recovery.
5. **Use one local expression? Not sufficient.** Folding ledger read,
   ownership proof, durable mutation, and user-facing failure reports into the
   early-absent branch would make the distinction between an absent path and an
   unproven record difficult to audit.
6. **Minimum new construction.** Add one private
   `recoverMissingProjection()` workflow-domain helper. It reads the ledger,
   selects exactly one valid owned entry without a current-link comparison,
   atomically removes that entry, and returns `already-converged`. Missing
   ledger remains a no-op; malformed, ambiguous, or unreadable ledger returns
   the existing fail-closed report; an atomic-write failure returns
   `inspection-failed` with the ledger entry intact. Do not require the source
   checkout to exist: recovery touches no source or projection, and adding that
   precondition would leave harmless interrupted records permanently stale.

## Stale-ledger recovery test-scope contract

### User goal and non-goals

Repair an interrupted AIOS-owned projection removal without claiming the whole
migration is complete: when the projection is already absent and its ledger
record is complete and valid, converge the ledger durably. Do not add a
lifecycle caller, delete any Superpowers or loop-control surface, mutate the
source checkout, alter present-link ownership rules, or exercise the remaining
malformed/filesystem/home-resolution rows in this vertical slice.

### Acceptance mapping

| Required behavior | Public observation | Completion criterion |
| --- | --- | --- |
| A complete signed ledger record survives an external removal of its managed symlink. | A temporary fixture creates a real source marker and owned symlink, records its creation identity in the ledger, then calls real `unlink()` on the managed path before invoking `reconcileRexWorkflowSurface()`. | The report is `already-converged` with no removed paths or conflicts; reading the on-disk ledger shows no consumed entry and the source marker is unchanged. |
| Repeating recovery is idempotent. | Invoke the public reconciler again after reading the repaired ledger. | The second report remains `already-converged` and the persisted ledger stays empty; no path is recreated or deleted. |
| No incomplete record gains authority from the recovery path. | This is deliberately out of the first RED/GREEN fixture and remains R2. | The first implementation must reuse complete-entry validation rather than introduce an unconditional absent-path ledger deletion. |

### Public seam and smallest failing vertical slice

- Allowed production seam: exported `reconcileRexWorkflowSurface()` in
  `scripts/lib/workflows/rex-workflow-surface-reconciliation.mjs`.
- Allowed test seam: a real temporary `CODEX_HOME`, `AGENTS_HOME`, and
  `AIOS_HOME`, real symlink/ledger files, the function's structured report,
  real ledger read-back, and the source marker. The fixture may calculate the
  documented ledger fingerprint and capture `lstat` identity, but may not mock
  private inspection, atomic-write, or unlink helpers.
- Smallest independent RED: extend the existing ledger-owned fixture by
  externally unlinking its managed projection before the first reconciliation
  call, then assert that the stale ledger entry is absent after the reported
  convergence. Current code reports `already-converged` before reading the
  ledger, so this assertion fails for the missing durable recovery behavior
  rather than for fixture setup or an unrelated dependency.
- Completion requires the focused command
  `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`
  to demonstrate the intended RED, then GREEN without deleting/skipping/
  weakening any existing assertion. The write-failure branch and all malformed
  or ambiguous states are separate named follow-up slices, not excuses to
  relax this public outcome.

## Stale-ledger recovery TDD RED

- Selected behavior: an externally removed, ledger-owned projection converges
  only after its stale AIOS ledger entry is durably consumed.
- Fixture precondition: a real source marker, managed symlink, creation
  identity, and signed ledger entry are created beneath a temporary home; the
  test then calls real `unlink()` on the managed symlink before invoking the
  exported reconciler.
- Expected user-observable result: `already-converged`, no removed paths or
  conflicts, an on-disk ledger with `entries: []`, absent managed path, and an
  unchanged source marker. A repeat call remains converged with the ledger
  empty.
- Exact command: `rtk node --test
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `1`; 3/4 tests passed and
  `reconciliation durably recovers a stale owned ledger after the projection
  is removed` failed at the ledger read-back. Actual ledger retained the valid
  entry; expected ledger was `{ schemaVersion: 1, entries: [] }`.
- Failure classification: valid RED. The current absent-path branch returns
  `already-converged` before it reads or updates the ledger. The fixture uses
  the public function and actual filesystem state, so the failure is exactly
  the missing durable recovery behavior rather than a test, syntax, or
  environment failure.

## Stale-ledger recovery TDD GREEN

- Implementation: the absent-projection path now calls a private
  `recoverMissingProjection()` helper. It reads the ledger before converging;
  an absent ledger or a valid ledger with no entry for this projection remains
  an idempotent no-op. Exactly one complete, fingerprint-valid owned entry is
  atomically consumed. Invalid, ambiguous, unreadable, or write-failed ledger
  states return a conflict or `inspection-failed` report without filesystem
  deletion.
- Ownership boundary: `selectOwnedEntry()` continues to validate the stored
  creation identity and requires a current identity only when a projection is
  present. Recovery has no present path to compare, so it validates the signed
  record and resolved source/projection strings while mutating only the AIOS
  ledger. It does not stat, unlink, or otherwise access the source checkout.
- Reuse/refactor: `entriesForProjection()` is the small shared cardinality
  helper used by both selection and recovery; it avoids two subtly divergent
  definitions of a projection's ledger entries without introducing a generic
  persistence abstraction.
- Exact verification: `rtk node --test
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs` exited `0` with
  4/4 passing, including the durable stale-ledger recovery fixture. `rtk git
  diff --check` also exited `0`.
- Scope: write-failure injection, malformed/corrupt entries, filesystem
  ambiguity, and home-resolution isolation remain the separately planned
  R2-R4 slices; no lifecycle caller or legacy surface changed.

## Stale-ledger recovery TDD REFACTOR

- Refactor: introduced the test-local `createOwnedProjectionFixture()` after
  the third real caller of the same owned-link setup. It owns only temporary
  directory creation, creation-identity capture, valid ledger serialization,
  and explicit-home options; each test still performs its distinct external
  mutation and public observation.
- Production boundary: `entriesForProjection()` is used by selection and
  missing-projection recovery, keeping the cardinality definition in one
  workflow-domain helper. No generic migration, deletion, or persistence
  framework was introduced.
- Test-diff review: the owned-link, stale-ledger, and same-target-replacement
  tests all invoke `reconcileRexWorkflowSurface()` and assert structured
  reports plus real link, ledger, and source-marker state. The refactor did not
  remove assertions, mock internal helpers, skip a path, loosen an expected
  conflict, or replace a user-visible assertion with a helper-call check.
- Exact verification: `rtk node --test
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs` exited `0` with
  4/4 passing. `rtk git diff --check` exited `0`.

## Stale-ledger recovery standards review

Reviewed scope: the R1 production diff, its four public temporary-filesystem
tests, the workflow-domain ownership policy, and the stale-ledger acceptance
contract. This review makes no code changes.

| Severity | Location and evidence | Actual impact | Required action |
| --- | --- | --- | --- |
| High | `selectOwnedEntry()` at lines 111-129 makes `linkIdentity` optional; the present-projection deletion path currently passes it at lines 196-200, but any future present-link caller can omit it and silently bypass the creation-identity proof. | A future reuse error can reintroduce deletion of a user replacement with the same target, despite the ledger and test contract. | Split complete ledger-record validation from present-link identity matching, or make the present-link selector require a non-optional identity and give recovery a separately named metadata-only validator. Add a regression that prevents the present-link path from accepting an omitted identity. |
| Medium | The R1 test at lines 123-154 proves successful atomic recovery but does not exercise a ledger-write failure. The current helper reports `inspection-failed`, but that behavior has no public regression evidence. | A later change can hide a failed persistence update after an otherwise successful recovery. | Add a deterministic public failure seam or safe filesystem fixture in a later R1 sub-slice; do not mock away the public result. |
| Medium | The acceptance table still lacks malformed/corrupt ledger, directory, foreign/dangling/source-unavailable, inspection-error, and path-isolation fixtures. | Fail-closed behavior is only partially protected, so lifecycle injection remains unsafe. | Complete R2-R4 before a caller or legacy-surface deletion is considered. |
| None | `recoverMissingProjection()` at lines 156-175 changes only AIOS ledger metadata and reuses `writeFileAtomic()`. The R1 test proves the source marker survives and no managed path is recreated or removed. | The successful recovery path does not delete user paths or the Superpowers source checkout. | Preserve this metadata-only boundary. |

Standards verdict: `changes-requested`. R1's happy path is behaviorally
verified, but the optional-identity API weakens the core ownership boundary and
must be corrected before extending this module.

## Stale-ledger recovery specification review

The review uses the Rex-only migration objective, the fail-closed reconciliation
acceptance table, and the R1 test-scope contract as specification evidence.

| Severity | Requirement status | Evidence and impact | Required action |
| --- | --- | --- | --- |
| Satisfied | A valid stale AIOS record is durably converged after the managed symlink has already disappeared. | The public fixture removes a real managed symlink, observes `already-converged`, reads an empty persisted ledger, verifies the source marker, and repeats successfully. | Retain this as the R1 regression test. |
| Blocker | Present projection ownership must remain bound to a creation-time identity, not merely depend on each caller remembering to pass one. | R1's optional selector parameter creates a bypass route contrary to the same-target replacement acceptance behavior. | Separate the absent-metadata and present-link proof interfaces, then rerun both R1 and replacement fixtures. |
| Blocker | The complete fail-closed state matrix and lifecycle convergence are still outside the implemented slice. | R2-R4 and all setup/update/init/installer/preflight/doctor callers remain absent by design; no Superpowers or loop-engineering surface was removed. | Finish pure reconciliation safety and re-review before beginning a distinct lifecycle integration work item. |
| Satisfied | R1 does not touch the source checkout or unknown user paths. | Recovery only writes the AIOS ledger after the managed path is observed absent; all present paths retain the existing conflict/deletion rules. | Preserve the no-filesystem-delete recovery invariant. |

Specification verdict: `changes-requested`. The narrow stale-ledger outcome is
complete, but its validation interface must be made non-bypassable before this
work item can safely advance to the remaining safety cases.

## Identity-proof interface hardening dependency graph

Work item: `rex-workflow-surface-identity-interface-2026-07-19`. Scope is the
private ownership-validation boundary inside the pure reconciler and its public
filesystem regressions; lifecycle and legacy-surface work remains excluded.

```text
I1 exact present-link proof interface
   |
   v
I2 explicit missing-projection metadata validator
   |
   v
I3 public regression + focused review
```

| Step | Input and completion condition | Dependency / safe failure point | Verification evidence |
| --- | --- | --- | --- |
| I1 - present-link proof | The existing deletion path receives a current `lstat` identity and must have no helper interface that makes that proof optional. Complete when its validator requires an identity match as part of its named contract. | First because it protects the only branch that can unlink a path. Preserve conflicts for any absent/mismatched identity. | Existing same-target replacement and owned-link public fixtures in `rtk node --test scripts/tests/rex-workflow-surface-reconciliation.test.mjs`. |
| I2 - missing-path validator | Stale-ledger recovery validates only signed metadata for an already absent projection through an explicitly separate named helper. Complete when this helper cannot be accidentally reused as a present-link deletion proof. | Depends on I1's domain split; it never calls `unlink`, `stat`, or source-checkout mutation. | Existing stale-ledger recovery fixture plus source-marker and ledger read-back assertions. |
| I3 - boundary review | The code and public tests prove distinct present-path and absent-path ownership rules without mock-only assertions or weakened conflicts. | Requires I1/I2. A review finding keeps R2-R4 and lifecycle integration blocked. | Focused test command, `rtk git diff --check`, standards/spec review record. |

The critical path is I1 -> I2 -> I3. The tests share one fixture file and the
validators share one module, so the edits remain sequential despite the two
behaviors being separately observable.

## Identity-proof interface hardening minimal-construction record

1. **Remove the requirement? Not applicable.** The optional identity parameter
   leaves a bypassable ownership boundary around the only path that calls
   `unlink()`.
2. **Reuse existing code? Applicable.** Reuse `entriesForProjection()`, the
   existing signed-record checks, `sameLinkIdentity()`, and all current public
   fixtures. The correction is a naming and call-boundary split, not a new
   ledger format or filesystem mechanism.
3. **Use the standard library? Not applicable.** No additional platform call
   can make a JavaScript optional function argument an explicit ownership
   contract; existing `lstat` identity data is sufficient.
4. **Add a dependency? Not applicable.** A type or validation dependency would
   add coupling without improving the local private contract.
5. **Use one local condition? Not sufficient.** Keeping an optional
   `linkIdentity` condition in a shared selector relies on every future caller
   remembering which semantic mode it needs and obscures review of the unlink
   boundary.
6. **Minimum new construction.** Keep one private signed-ledger-record selector
   with no filesystem-identity semantics, used only by missing-projection
   metadata recovery. Add one private present-link selector that obtains that
   record and requires a valid, matching current identity before returning it.
   The only unlink path calls the present-link selector; recovery calls only
   the metadata selector. No exported shape, ledger schema, source access, or
   lifecycle caller changes.

## Identity-proof interface hardening test-scope contract

### User goal and non-goals

Make the existing ownership proof non-bypassable in the reconciler's private
interface while preserving its public behavior. Do not introduce a test-only
export, public option, lifecycle caller, schema change, source-checkout access,
or additional filesystem state solely to force an artificial test failure.

### Acceptance mapping

| Required behavior | Stable public observation | Completion criterion |
| --- | --- | --- |
| A present same-target replacement is never removed merely because its ledger record is otherwise valid. | The existing real replacement fixture calls the exported reconciler and observes `legacy-workflow-conflict`, both links, and the source marker. | It remains green after hardening; code review confirms the unlink path can only obtain an entry through an identity-required selector. |
| A missing valid projection still repairs only the ledger. | The existing real stale-ledger fixture observes `already-converged`, an empty persisted ledger, absent projection, and source marker preservation. | It remains green after hardening; the recovery helper uses only the separately named metadata selector. |
| Private interface hardening does not claim a fabricated new user behavior. | Both existing public fixtures already pass before this implementation-only correction. | Do not add a mock-only/internal-call test or label an already-passing public test as a valid TDD RED. The semantic split is verified by review of the bounded private diff. |

### Test seam and execution implication

- Stable public seam: `reconcileRexWorkflowSurface()` with the existing
  temporary filesystem fixtures in
  `scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- The smallest user-observable vertical slices were already established by the
  replacement and stale-recovery tests. The planned code change makes their
  private proof interfaces explicit; it does not alter an input/output state
  that can honestly supply a new RED.
- Therefore the next implementation must run the focused command before and
  after the refactor, preserve all assertions, and record a diff/review
  evidence boundary. If a later change introduces a user-observable omission
  path, it requires a new test-design Command rather than an internal mock.

## Identity-proof interface hardening TDD RED observation

- Exact command: `rtk node --test
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs`.
- Actual result: exit status `0`; all 4/4 public filesystem tests passed,
  including same-target replacement preservation and stale-ledger recovery.
  `rtk git diff --check` also exited `0`.
- Classification: this is not a valid RED. The requested change is a private
  proof-interface split whose existing public behaviors already pass. Creating
  a test-only export, mocking a private selector, weakening a public assertion,
  or calling this passing result a failing-test observation would violate the
  approved test seam and Rex TDD invariants.
- Current workflow action: no `failing-test-observed` evidence was submitted
  and the Rex activation remains at its RED stage. The appropriate continuation
  is a Rex capability decision that supports behavior-preserving
  refactor/interface hardening, or an explicitly approved user-observable
  requirement that can supply a legitimate RED; it is not safe to fabricate
  either one in this work item.

## AIOS Superpowers and loop-surface retirement dependency graph

Work item: `rex-remove-aios-superpowers-loop-surfaces-2026-07-19`. This is a
separate behavior-change work item. It consumes the completed, ownership-safe
workflow-surface reconciler but never deletes a user-owned Superpowers checkout.

```text
P1 public-contract RED tests
   |
   v
P2 remove AIOS-owned component / CLI / lifecycle / doctor / registry / planning
   |
   +--> P3 remove loop-operation role and recipe source
   |       |
   v       v
P4 regenerate managed agent, native, and skill projections
   |
   v
P5 focused + integration verification and source-surface review
```

| Step | Input and completion condition | Dependency / safe failure point | Verification evidence |
| --- | --- | --- | --- |
| P1 - public regression contract | Add stable public tests that reject `superpowers` as a component/internal target, omit it from client capabilities and TUI options, and exclude `rex-loop-operator` / `loop-operation` from the generated catalogue and recipe registry. | First: the assertions must fail against the current shipped public surface. Do not use import-call counts or delete assertions simply to pass. | Focused `node --test` command captured as a non-zero Rex receipt. |
| P2 - retire host-owned Superpowers | Remove the AIOS component, wrappers, selection/defaults, internal command, lifecycle/doctor/planning imports, and capability declaration. Existing installation paths retain the reconciler only, which is marker/ledger/identity guarded. | Depends on P1. If any caller still tries to install, update, doctor, or select the old component, retain the test failure and fix the owning module. | Component, lifecycle, CLI, client-capability, doctor, and TUI public tests pass. |
| P3 - retire independent loop control plane | Remove the canonical `rex-loop-operator` role and AIOS `loop-operation` recipe/routing rather than hiding them from one client. | Depends on P1; source removal must precede generated projection updates. Do not remove unrelated Rex harness/recovery capabilities. | Agent catalogue and workflow tests no longer resolve either identifier. |
| P4 - synchronize generated projections | Run the existing agent/native/skill generators from canonical sources; never hand-edit `.codex`, `.claude`, `.agents`, or client projection output. | Depends on P2/P3. A generator or sync check failure blocks completion; source remains the only edit point. | Generator output plus `check-native-sync`, `check-skills-sync`, and agent smoke evidence. |
| P5 - verify the migration boundary | Review the diff for an AIOS-owned removal only; verify all removal tests and the existing reconciliation tests, then run the broader scripts/Rex suites. | Depends on P2-P4. Any test or training gate failure remains an explicit blocker rather than a completion claim. | Real zero-exit command receipts, diff check, and recorded unresolved training evidence if any. |

The critical path is P1 -> P2/P3 -> P4 -> P5. P2 and P3 share generator
outputs and therefore remain one sequential source-edit batch; no parallel
agent work is required.

## AIOS Superpowers and loop-surface retirement test-scope contract

### User goal and non-goals

The public AIOS distribution must expose the Rex-only workflow surface: no
selectable or executable AIOS Superpowers component, no Superpowers doctor or
planning projection, and no AIOS-owned `loop-operation` / `rex-loop-operator`
control plane. A pre-existing user checkout such as `~/.codex/superpowers` is
not an AIOS deletion target; the separately tested ownership-safe reconciler
remains the sole migration cleanup path.

This slice does not remove the generic concepts of plans, skills, agents,
native instructions, or AIOS's bounded harness host. It also does not test a
private import's call count, require an actual user home directory, or treat a
source scan alone as a substitute for a public behavior assertion.

### Acceptance mapping

| Required behavior | Stable public test seam | Completion criterion |
| --- | --- | --- |
| A user cannot select Superpowers through setup/update/uninstall or invoke its internal command. | `normalizeComponents()` and `parseArgs()` are the shared public CLI option/parser boundary. | `superpowers` is rejected with the same unsupported-target/component errors as every other unshipped name. |
| Commands and doctor output no longer advertise an independent Superpowers workflow. | `getCommandHelpText()` and the serialized `runDoctorSuite()` checks. | Help and doctor check ids contain no Superpowers entry, while the Rex workflow-surface reconciliation check remains. |
| No client can advertise an AIOS Superpowers capability. | `CLIENT_CAPABILITIES` plus every `CLIENT_DEFINITIONS[client].capabilities` list. | There is no `superpowers` capability or capability-order resolver. |
| The rendered Ink setup/update/uninstall and doctor choices do not offer or mention Superpowers. | The typed component list/labels and `DoctorScreen` rendered copy are the UI's stable option source. | The source-backed UI contract has four component keys and no Superpowers label/gate text. |
| AIOS no longer publishes an independent loop recipe or loop operator. | `listWorkflowRecipes()` and `loadCanonicalAgents()` generated from canonical source. | Neither `loop-operation` nor `rex-loop-operator` is resolvable; Rex adaptive workflow remains present. |
| Generated native/agent/skill projections follow the canonical Rex-only source. | Existing sync generators/checkers, not direct edits to generated roots. | Generator/checker tests complete without a Superpowers routing partial or agent projection. |

### Minimal independently failing vertical slice

Create `scripts/tests/rex-only-workflow-surface-retirement.test.mjs` using the
stable public seams above. It must make the current checkout fail because it
still accepts `superpowers`, advertises it in the client registry and UI
source, and returns the loop recipe/operator. This single test file is enough
for RED because every removed user-visible entry point is represented by its
own exported parser, registry, rendered option source, or catalog API. The
existing lifecycle/reconciliation tests remain the migration safety coverage
and are not weakened.

Focused RED/GREEN command:

```bash
rtk node --test scripts/tests/rex-only-workflow-surface-retirement.test.mjs
```

After the source removal, expand verification to the existing CLI, doctor,
lifecycle, client-registry, native-sync, agent-workflow, and reconciliation
tests. This contract deliberately has no mock-only assertion and no skipped
legacy test: old expectations are updated only after the public behavior is
removed.

## AIOS Superpowers and loop-surface retirement TDD RED observation

- Public entry: the shared component parser and internal command parser used
  by setup/update/uninstall and `aios internal`.
- Scenario setup: the new stable public regression file
  `scripts/tests/rex-only-workflow-surface-retirement.test.mjs` invokes
  `normalizeComponents(['superpowers'])` and the internal Superpowers command
  before checking the rest of the visible surfaces.
- Exact command: `rtk node --test
  scripts/tests/rex-only-workflow-surface-retirement.test.mjs`.
- Expected observation: the parser rejects `superpowers` as an unsupported
  component and the internal command rejects it as an unknown target.
- Actual observation: exit status `1`; the first assertion fails with
  `AssertionError: Missing expected exception` because
  `normalizeComponents(['superpowers'])` accepts the legacy component.
- Receipt: `receipt:75c4ff84-144d-4526-b535-4bbf16a30ecc` records the exact
  non-zero test execution in this workspace.
- Failure classification: valid behavior-delta RED. The failure is a real,
  externally reachable component-selection behavior, not a mock, an internal
  call count, an old log, or an assertion weakened to fit the implementation.
- Stage-local re-observation: `receipt:0319e261-8db3-4976-b1a5-68f13f68d9fb`
  reran the exact focused test during the current Rex `red` stage and recorded
  exit status `1`. Its direct test output again identifies
  `normalizeComponents(['superpowers'])` accepting the legacy component as the
  first observable failure.

## AIOS Superpowers and loop-surface retirement TDD GREEN implementation diff

- Removed the AIOS-managed Superpowers component implementation and its
  install/update/doctor wrappers. Setup, update, uninstall, component parsing,
  internal CLI dispatch/help, command help, doctor checks, client capabilities,
  and Ink option models now reject or omit that retired surface.
- Removed the host-owned planning-skill projection and fixed external skill
  sequences. Generic plan artifacts remain, while Rex is the only source of a
  current Provider command.
- Removed the canonical `rex-loop-operator` role, its optional catalogue role,
  and the AIOS-owned `loop-operation` recipe plus its exclusive quality gates.
- Updated canonical native-source instructions to describe Rex Provider
  selection instead of a compatibility playbook. Generated projections and the
  broader legacy regression suite remain the next bounded verification step.
- Focused GREEN evidence: `receipt:d0ca20e6-602a-43fa-b965-14e890506181`
  ran `node --test scripts/tests/rex-only-workflow-surface-retirement.test.mjs`
  and exited `0` with the public Rex-only workflow-surface assertion passing.

## AIOS Superpowers and loop-surface retirement refactor review

### Refactor scope and design review

- Updated the remaining regression fixtures instead of restoring a deleted
  component: parsers reject the retired internal target, client capabilities
  exclude it, lifecycle tests exercise only native/agent writes, and generic
  planning artifacts preserve only the current Rex-selected Provider.
- Removed the inactive compatibility fallback in
  `scripts/lib/planning/workflow-policy.mjs`. A missing Rex decision now
  produces no Provider injection; only a current `skill` Provider from the
  Rex Command can enter `requiredSkills`.
- Kept cleanup narrowly encapsulated in the existing workflow-surface
  reconciler. Its ledger, marker, link identity, device/inode/mode checks, and
  `lstat`-based fail-closed behavior remain the sole path that can remove an
  AIOS-owned legacy projection. It never deletes an arbitrary user checkout.
- Removed obsolete loop-role entries from the agent catalogue/smoke plan and
  the deleted component facade from architecture rules. Canonical native and
  skill sources now describe the Rex Command boundary, then regenerate their
  client projections through existing sync tooling.
- The residual `superpowers` strings are intentionally limited to historical
  plan lookup, the ownership-safe reconciler/doctor label, and negative or
  migration-safety assertions. They do not expose a selectable component,
  capability, provider, TUI item, install/update path, or client projection.

### Fresh refactor validation

The following real command completed with exit status `0` after the refactor:

```bash
rtk node --test \
  scripts/tests/rex-only-workflow-surface-retirement.test.mjs \
  scripts/tests/rex-workflow-surface-reconciliation.test.mjs \
  scripts/tests/aios-cli.test.mjs \
  scripts/tests/aios-components.test.mjs \
  scripts/tests/aios-lifecycle-plan.test.mjs \
  scripts/tests/aios-doctor.test.mjs \
  scripts/tests/client-registry.test.mjs \
  scripts/tests/ecc-agent-workflow.test.mjs \
  scripts/tests/planning-contract.test.mjs \
  scripts/tests/workflow-policy.test.mjs \
  scripts/tests/competitor-iteration.test.mjs \
  scripts/tests/preflight-contracts.test.mjs \
  scripts/tests/native-sync.test.mjs \
  scripts/tests/native-route-commands.test.mjs \
  scripts/tests/native-agent-guidance.test.mjs \
  scripts/tests/default-mode.test.mjs
```

Result: `264 pass`, `0 fail`. `rtk git diff --check` also completed with exit
status `0` before that test run. The remaining broader suite, Rex package
tests, training gate, and release-level checks are still required before the
work item can be declared complete.

## Rex-only migration standards and specification review

Reviewed scope: the complete AIOS Superpowers/loop-surface retirement diff,
the ownership-safe reconciliation entry points, the Rex testability and receipt
changes, their public/contract tests, and the original user requirements for
Rex-owned long-running progression and non-fabricated evidence. This review
makes no implementation claim and does not treat a focused green run as a
release verdict.

### Standards review

| Severity | Location and evidence | Actual impact | Required action |
| --- | --- | --- | --- |
| Blocker | `rex-harness/src/domain/testability-decision.mjs:34-47,100-121` records the intended public `command` only as free text and checks only the referenced receipt's exit code. `src/application/validate-command-evidence.mjs:25-50` likewise accepts any resolvable receipt with the required zero/non-zero exit. The positive standalone test at `tests/standalone/standalone-cli.test.mjs:207-235` captures `node -e 'process.exit(7)'`, describes a different `node --test checkout-validation.test.mjs` scenario, and is nevertheless routed to `rex-tdd`. | A generic successful or failing command can be labelled as a real public scenario. This prevents neither a fabricated RED nor a fabricated hardening baseline in the sense required by the user: the receipt proves that *some* command ran, not that the declared scenario ran or failed for the declared reason. | Replace free-text scenario commands with a normalized executable/argument/cwd contract (or an immutable command fingerprint), require the receipt command to match it, and bind RED/GREEN/refactor/baseline evidence to the persisted testability decision. Add negative tests for a mismatched command, wrong working directory, wrong exit, missing receipt, and an unrelated failing command. Keep the trust boundary explicit: a process able to rewrite the same local receipt store still requires privilege separation or an external attestor; hashes alone are not an attestation. |
| High | `rtk npm --prefix rex-harness test` completed with `72 pass, 7 fail`. `tests/application/activation-lifecycle.test.mjs:13-18` and `tests/scenarios/adaptive-routing.test.mjs:33-46,65-81` still assert strict TDD from behavior/scope/risk facts without the new `honest-red-candidate` fact. `tests/application/request-evaluation.test.mjs:38-75` supplies completed test design without the required typed testability decision. | The full Rex regression suite is red, so the migration cannot be released or presented as verified even though its focused AIOS suite is green. The failing tests also leave the new routing boundary incompletely specified. | Update each test to model a valid typed behavior-delta decision and receipt-backed `honest-red-candidate`; add complementary assertions that scope/risk without that decision remains at test design. Do not weaken the new routing rule to satisfy old fixtures. |
| Medium | `tests/application/software-workflow-runtime.test.mjs:175-191` is named and scoped as a missing-receipt test but invokes the public workflow API without any `resolveReceipt`. The observed error is therefore `requires an execution receipt resolver`, not `requires at least one receipt: reference`. | The desired public invariant is not tested through the workflow API; a regression in the missing-receipt branch could pass unnoticed. | Supply the real test resolver, keep a non-receipt reference, and assert the missing-receipt error. Retain a separate test for the missing-resolver configuration error. |
| Medium | `tests/contract/software-recipes.test.mjs:18` hard-codes `12` candidates while `src/kernel/capability-pack.mjs:17-31` now includes the new hardening capability. | The contract suite neither accepts nor describes the behavior-preserving-hardening route; a future accidental deletion could be hidden by merely changing a count. | Assert the hardening capability by id, Provider binding, and `baseline -> harden -> verify-invariants` stages; use a count only as a secondary completeness check. |
| None | The retirement surface itself is narrowly isolated: installer, init, setup, update, preflight, and doctor all reuse the Rex reconciliation seam, while the focused retirement/reconciliation regression recorded `264 pass, 0 fail`. | This supports the non-`aios update` migration requirement and does not show a competing selectable AIOS Superpowers or loop operator surface. | Preserve the ownership-checked reconciliation boundary while repairing the blockers above. |

Standards verdict: `changes-requested`. The focused migration edits are
consistent with the Rex-only direction, but full verification remains red and
the new receipt policy does not yet prove that the claimed public scenario was
executed.

### Specification review

| Severity | Requirement status | Evidence and impact | Required action |
| --- | --- | --- | --- |
| Blocker | Missing: the user-required anti-fabrication guarantee for real scenario testing. | The standalone positive test demonstrates acceptance of an unrelated synthetic `process.exit(7)` receipt for a declared checkout-validation test. Exit-code validation is useful, but it is insufficient evidence of the scenario, the failure reason, or the observable user behavior. | Implement command-to-receipt binding first, then make the testability decision the single persisted source for later RED/GREEN/refactor/baseline receipt validation. Document the local-host threat model and require a trusted/external runner for adversarial-agent attestation. |
| Blocker | Missing: Rex-owned long-running delivery semantics requested for harness/loop engineering. | The planned task `t2-rex-contract` remains unchecked. Targeted source audit found no Rex feature/acceptance ledger, one-feature iteration state, or Rex terminal `continue` / `retry` / `human-gate` decision contract; the current runtime only advances a current Capability and leaves host iteration policy unspecified. | Add a Rex domain contract and public scenarios for initialization, clean baseline, feature ledger, one feature per bounded iteration, accepted Evidence, and explicit continuation/blocked/human/complete outcomes. AIOS may execute iterations and persist ContextDB/recovery data, but must consume that Rex decision rather than recreate a loop controller. |
| High | Partially satisfied: new installation and migration entry points converge to a Rex-only AIOS surface. | The diff removes AIOS-owned Superpowers component/CLI/TUI/doctor/planning/capability paths and loop operation, and the reconciler is called by installer/init/setup/update/preflight/doctor. The focused 264-test suite is green. | Keep this acceptance row, but do not mark the overall user request complete until the full Rex suite and the required release-level checks are green. |
| Satisfied | User-owned Superpowers source checkouts are not an intended deletion target. | The reviewed reconciler is ledger/marker/link-identity guarded; its residual legacy names are migration-safety paths rather than a compatibility Provider. | Retain fail-closed conflict reporting and never broaden cleanup to an unproven same-name directory. |

Specification verdict: `blocked pending corrective work`. The removal/migration
direction is implemented and focused-tested, but it cannot satisfy the stated
evidence or self-progressing Rex requirements until the two blockers are
implemented and all Rex regressions are brought back to green.

### Exact review verification

- `rtk npm --prefix rex-harness test`: exit status `1`; `72 pass`, `7 fail`.
  The seven failures are the stale strict-TDD/testability fixtures, the
  missing-resolver assertion, and the obsolete recipe count listed above.
- `rtk node --test rex-harness/tests/standalone/standalone-cli.test.mjs
  rex-harness/tests/application/validate-command-evidence.test.mjs
  rex-harness/tests/application/software-workflow-runtime.test.mjs`: exit
  status `1`; the same missing-resolver assertion fails while the mismatched
  standalone scenario/receipt fixture currently passes, confirming the
  command-binding review finding.
- `rtk git diff --check` had previously completed with exit status `0` for the
  migration diff; formatting is not the blocker.

## Scenario-bound receipt contract test-scope

Work item: `rex-bind-test-scenario-receipts-2026-07-19`. This is the first
corrective slice from the review above. It hardens the Rex evidence boundary;
it does not implement the separate long-running feature-ledger contract.

### Safety baseline and ownership

- `main` tracks `origin/main`, but `git status --short` contains the known
  in-progress Rex-only migration changes. Per `pre-edit-safety-gate`, no
  `git pull --ff-only`, stash, reset, rebase, force update, or discard is safe
  in this batch.
- CRG MCP is unavailable in this client session. The fallback used targeted
  searches across `testability-decision`, `execution-receipts`, the standalone
  store, the AIOS adapter, and their public tests. No graph result is claimed.
- Reuse the existing `execution-receipts` domain, `validateCommandEvidence`,
  `validateTestabilityDecisionReceipt`, standalone capture/resolution, and
  AIOS resolver adapter. The added contract belongs in the Rex domain/workflow
  boundary, not in an AIOS-only verifier or a new generic utility directory.

### User goal and explicit non-goals

The receipt used to establish or advance a testability path must prove that the
declared executable, arguments, and working directory were actually the
scenario invoked by the Rex receipt command. A non-zero `node -e
process.exit(7)` must not be accepted as a checkout-validation RED merely
because both are non-zero.

Non-goals: cryptographically attesting a malicious process that can rewrite
the same local workspace, changing unrelated migration cleanup, adding a
remote service, or inventing a second AIOS evidence/loop controller. Stronger
adversarial assurance requires a separately privileged or external runner;
this slice prevents false scenario attribution at the existing trusted-host
boundary.

### Acceptance mapping

| Required behavior | Stable public seam | Completion criterion |
| --- | --- | --- |
| A testability decision declares a machine-checkable scenario command. | `rex-harness evidence --testability-file` through `submitStandaloneEvidence()`. | A structured executable/argument/cwd declaration is normalized with the decision and persisted; unstructured legacy text is rejected with a migration error rather than silently compared as prose. |
| A behavior-delta decision cannot use a receipt from an unrelated failed command. | Standalone CLI against a temporary project root and an actual captured receipt. | A receipt for a different executable, arguments, or cwd is rejected before the workflow selects `rex-tdd`; an exact scenario receipt with non-zero exit is accepted. |
| A hardening baseline cannot use a receipt from an unrelated passing command. | `advanceSoftwareWorkflow()` plus the same typed decision/receipt domain contract. | A mismatched zero-exit receipt is rejected; an exact baseline receipt selects only `rex-refactor-hardening`. |
| Later delivery evidence remains tied to the recorded scenario. | Public workflow transition with persisted testability decision and its receipt resolver. | RED accepts only a matching non-zero receipt; GREEN and REFACTOR accept only matching zero-exit receipts; tests cover wrong command, wrong cwd, wrong exit, missing receipt, and unknown receipt. |
| AIOS does not diverge from standalone semantics. | `recordAiosCapabilityEvidence()` and `advanceStoredAiosCapabilityActivation()` using the shared Rex validator. | Existing AIOS activation-store/runtime contract tests use matching captured commands and reject the mismatched one. |

### Smallest independently failing vertical slice

Extend `rex-harness/tests/standalone/standalone-cli.test.mjs`, the existing
public CLI workflow test, with a temporary actual `node --test` scenario. The
test will capture an unrelated `process.execPath -e process.exit(7)` receipt
but declare the fixture's structured test command in `testability.json`; it
must expect a precise scenario-command mismatch error. The current code either
rejects the structured declaration as unsupported or, with the legacy textual
shape, accepts the unrelated receipt, so this focused assertion is an honest
RED for the desired public behavior. A paired exact-command fixture establishes
the valid path; no mocked private selector, internal call count, skipped test,
or weakened assertion is acceptable.

The vertical slice is sufficient because all standalone and AIOS entry points
already delegate to the same exported Rex decision/evidence boundary. Follow-up
tests can cover each stage without duplicating a second implementation.

### Design constraints

1. Keep the command comparison in the Rex receipt/testability domain. It must
   compare normalized executable, complete string argument list, and resolved
   working directory; neither `command` prose nor only an exit code is enough.
2. Use the persisted typed testability decision as the one source of the
   expected command when validating TDD and hardening evidence. Do not let
   AIOS reconstruct the scenario or approve a different command.
3. Preserve fail-closed behavior: missing resolver, missing receipt, unknown
   receipt, malformed declaration, mismatched receipt id, command, cwd, or
   exit code all reject before advancing an Activation.
4. Reuse the current public error/evidence model and repository test layout.
   Add only small domain helpers where multiple callers genuinely share the
   same comparison; do not create a validation framework.

### Focused verification plan

1. `rtk node --test rex-harness/tests/standalone/standalone-cli.test.mjs`
2. `rtk node --test rex-harness/tests/application/validate-command-evidence.test.mjs rex-harness/tests/application/software-workflow-runtime.test.mjs`
3. `rtk node --test scripts/tests/rex-activation-store.test.mjs scripts/tests/rex-capability-runtime.test.mjs`
4. `rtk npm --prefix rex-harness test` after the narrow tests are green.

### TDD RED observation

- Exact command: `rtk node --test
  rex-harness/tests/standalone/standalone-cli.test.mjs`.
- Actual result: exit status `1`; two existing standalone workflow tests pass
  and the new public CLI regression fails because submitting the typed decision
  with an unrelated non-zero receipt returns process status `0` instead of the
  required rejection. The failure is at the stable standalone evidence entry,
  not a mocked helper or an internal-call count.
- The test creates a real checkout-validation test file and declares its
  structured executable/arguments/cwd. It captures a different real command,
  `node -e process.exit(7)`, and proves the current workflow accepts that
  receipt. This is the exact false-attribution path identified in review.
- Receipt: `receipt:aca4bfdd-4287-4f78-8212-68a1e67aec87` captured the exact
  focused failing test command with exit status `1` from the project root.
- Classification: valid behavior-delta RED. The desired user-visible behavior
  is refusal of an unrelated receipt; the observed acceptance is neither a
  syntax failure nor pre-existing unrelated suite noise.

### Implementation and GREEN verification (not an activation advance)

- Bounded implementation: `execution-receipts` now normalizes a command as
  `executable`, ordered string `args`, and an absolute normalized `cwd`;
  testability decisions persist that object instead of command prose. The Rex
  validator rejects a receipt whose command differs in any of those fields.
- The persisted behavior-delta scenario is supplied to the Rex workflow for
  TDD RED/GREEN/REFACTOR evidence; the hardening scenario is supplied for its
  baseline stage. AIOS continues through the same public Rex validator rather
  than maintaining a host-specific comparison.
- Exact command: `rtk node rex-harness/bin/rex-harness.mjs receipt --root
  /Users/rex/codes/aios -- node --test
  rex-harness/tests/application/validate-command-evidence.test.mjs
  rex-harness/tests/application/software-workflow-runtime.test.mjs
  rex-harness/tests/standalone/standalone-cli.test.mjs`.
- Actual result: exit status `0`, 11 focused public/domain tests passed, and
  receipt `receipt:8abc0f57-2817-493d-b7e6-d044d93fc137` records the exact
  command, root cwd, and zero exit. The tests separately reject a changed
  executable, changed argument list, changed cwd, unrelated non-zero receipt,
  wrong zero-exit baseline, and mismatched RED/GREEN/REFACTOR receipt.
- Full Rex verification: `rtk npm --prefix rex-harness test` completed with
  `81 pass`, `0 fail`; `rtk npm run test:scripts` completed all normal
  workflow/Rex integration suites, while its legacy SkillOpt-evidence fixtures
  are unavailable in this checkout and fail only with missing `.skillopt/*`
  files (not as a product regression).

### In-flight activation migration result

- The original test-design activation persisted its historical free-text
  `redCandidate.command` before the schema change. It is intentionally not
  retrofitted or silently reinterpreted.
- Re-submitting its real prior RED receipt to current activation
  `a65cdc5b-4a62-45aa-bb7b-1d8771063ca9` now returns `legacy or invalid
  testability scenario cannot resume delivery; start a fresh test-design
  activation`. No activation/evidence ledger was written by that failed call.
- This is a fail-closed migration boundary, not a GREEN/REFACTOR receipt for
  the old activation. Any in-flight workflow with a legacy command must start
  a fresh test-design activation and capture a structurally matching scenario
  before it can enter delivery.

## Rex long-running delivery contract test-scope

Work item: `rex-long-running-delivery-contract-2026-07-19`. This is the
separate Rex-owned control-loop slice requested for long-running agents; it
does not restore any AIOS Superpowers or loop-operation implementation.

### User goal, boundaries, and non-goals

Rex must own the semantic progression of a long-running software objective:
verify a clean baseline, persist a feature/acceptance ledger, select exactly
one current feature, and use accepted evidence to return one explicit decision
among `continue`, `retry`, `blocked`, `human-gate`, and `completed`. AIOS may
run one fresh-context iteration, persist ContextDB/checkpoints, enforce host
safety, and resume after interruption, but it must not independently select
the next feature or reinterpret completion from prose.

This slice will not build an autonomous shell loop in Rex, duplicate the
existing AIOS persistence/journal implementation, run arbitrary commands from
the feature ledger, or claim adversarial-machine attestation. Feature and
baseline commands remain structured, receipt-bound public scenarios at the
existing trusted-host boundary.

### Acceptance mapping

| Required behavior | Stable public seam | Completion criterion |
| --- | --- | --- |
| Initialize an owned delivery ledger. | New exported Rex long-running delivery API. | A typed baseline scenario and ordered feature records persist immutably enough to resume; malformed IDs, duplicate features, unstructured commands, or missing acceptance records are rejected. |
| Gate the first feature on a real clean baseline. | Initial Rex decision returned from the API. | A matching zero-exit baseline receipt selects feature `F1` and returns `continue`; a failed or absent baseline cannot select a feature. |
| Enforce one-feature iteration. | Current Rex command/decision plus advance API. | Evidence for `F2` while `F1` is current is rejected. A verified `F1` advances only to the next ordered pending feature. |
| Decide progress only from typed evidence. | Rex ledger transition result. | Matching accepted verification returns `continue`; retryable failure returns `retry` for the same feature; missing/invalid evidence returns `blocked`; explicit unresolved acceptance or exhausted retry policy returns `human-gate`; all accepted features returns `completed`. |
| Keep AIOS a host adapter. | AIOS Rex long-running adapter and harness-facing integration test. | The host persists/reloads the Rex ledger and executes one supplied iteration, but consumes the Rex result verbatim and contains no next-feature selector. |
| Keep evidence scenario-bound. | Shared execution-receipt matcher. | Baseline and feature receipts must match the persisted executable/args/cwd and required exit semantics; a same-exit unrelated command cannot advance the ledger. |

### Test seams and minimal vertical slices

1. Rex domain test: initialize with two ordered feature records and an actual
   matching baseline receipt. It must return a `continue` decision for only
   `F1`; a duplicate/unknown feature id and an `F2` advance attempt fail
   independently.
2. Rex domain test: complete `F1` with a matching acceptance receipt and
   observe `continue` for `F2`; complete `F2` and observe `completed`. A
   non-zero matching feature receipt produces `retry` without changing the
   selected feature.
3. Rex domain test: inject missing evidence and an explicitly unresolved
   acceptance decision to observe `blocked` and `human-gate`; neither state
   selects another feature.
4. AIOS adapter test: persist a Rex-issued decision, run exactly one synthetic
   host iteration, reload it after a simulated restart, and assert the host
   merely returns Rex's decision. The test may fake host execution but must use
   actual Rex-ledger evidence transitions; it cannot mock the Rex selector.

### Proposed contract shape

- `startLongRunningDelivery({ workItemKey, baseline, features, retryPolicy })`
  returns a versioned `rex.long-running-delivery.v1` ledger and a single
  current decision. `baseline` and every feature acceptance scenario use the
  existing structured command shape.
- `advanceLongRunningDelivery(ledger, evidence, { resolveReceipt })` validates
  the current baseline or current feature only and returns the next immutable
  ledger plus its decision. A `continue` decision carries exactly one
  `currentFeatureId`; terminal decisions carry no next feature.
- A feature record contains a stable id, public acceptance description,
  structured verification scenario, status, retry count, and evidence refs.
  The caller cannot reorder or replace already accepted features during an
  iteration.
- The AIOS bridge stores this opaque Rex ledger alongside its existing
  activation/checkpoint artifacts, invokes a fresh host iteration only for the
  returned current feature, and sends the evidence back to the Rex API. It does
  not derive `continue`, retry policy, feature order, blocked, human-gate, or
  completed itself.

### First independently failing test

Add a public Rex domain test that calls the initializer with a real temporary
baseline receipt and two declared feature scenarios. Before implementation,
the stable public entry does not exist, so the test fails for the missing Rex
long-running contract rather than a fixture or environment error. The first
GREEN implementation is limited to the domain ledger, initializer, and
single-feature decision/advance transition; AIOS persistence follows only
after that public Rex behavior is green.

### Long-running TDD RED observation

- Exact command: `rtk node --test
  rex-harness/tests/workflows/long-running-delivery.test.mjs`.
- Actual result: exit status `1`; the public test fails at
  `typeof rex.startLongRunningDelivery`, observed as `undefined` rather than
  the required exported function.
- The test still creates a temporary root and captures a real zero-exit
  baseline receipt before making the missing API assertion. It does not fail
  from a bad test command, unavailable fixture, mock, or unrelated dependency.
- Receipt: `receipt:354a83e4-b75c-4a0f-80ac-640a7f531317` captures that exact
  failing public test command from `/Users/rex/codes/aios` with a
  non-zero exit.
- Classification: valid behavior-delta RED. The required user-visible Rex
  initialization contract is absent; no implementation has been applied.

### Initialization slice review

Reviewed scope: `rex-harness/src/domain/long-running-delivery.mjs`, its public
export in `rex-harness/src/index.mjs`, and
`rex-harness/tests/workflows/long-running-delivery.test.mjs`.

#### Standards review

| Severity | Location and evidence | Impact | Action |
| --- | --- | --- | --- |
| None | The new domain module reuses `normalizeExecutionCommand`, `normalizeExecutionReceipt`, and `assertExecutionReceiptMatchesCommand` instead of introducing another command/receipt parser. | The new state boundary remains scenario-bound and does not copy existing anti-forgery logic. | Retain this dependency direction for feature transitions. |
| None | `startLongRunningDelivery()` is exported only through `src/index.mjs`; the test imports that public entry rather than a private helper. | Consumers receive a stable public seam while the module can retain its internal validation helpers. | Retain this API boundary. |
| Low | The current test asserts the selected ID and that F2 is pending, but not that F1's record is `active`. | A future edit could leave a contradictory per-feature status while preserving the selected ID. | In the next TDD slice, add a public assertion that only `currentFeatureId` has `active` status. |

Standards verdict: accepted for the bounded initializer slice. The focused
command passed with `receipt:2f282f65-7fe5-4617-8386-e76d7b246836`, and the
post-review run passed with `receipt:dd0fa5b9-92c7-468d-8bc6-28f851da8033`.

#### Specification review

| Severity | Missing or satisfied requirement | Evidence and impact | Required action |
| --- | --- | --- | --- |
| Satisfied (partial) | The initializer creates a versioned Rex-owned ledger, validates a matching zero-exit baseline receipt, and returns `continue` for exactly the first ordered feature. | The public domain test exercises a real temporary receipt and the exported API; AIOS is not consulted to pick F1. | Preserve this as the first vertical slice. |
| Blocker | `advanceLongRunningDelivery()` and its evidence transitions do not exist. | The implementation cannot reject F2 evidence while F1 is current, record F1 acceptance, return F2, or return `retry`, `blocked`, `human-gate`, or `completed`. | Add independently failing public scenarios for each transition, then implement the Rex-only transition API with scenario-bound receipts. |
| Blocker | No AIOS adapter persists the opaque ledger or executes exactly one Rex-issued iteration. | The requested host/Rex boundary is not yet observable, so AIOS could still recreate a semantic next-feature selector. | After the Rex transition API is covered, add the adapter/store integration and a restart test that consumes Rex's returned decision verbatim. |

Specification verdict: changes requested for the overall long-running objective.
This accepted initializer slice is not evidence that the broader harness/loop
contract is complete.

## Long-running transition minimal-construction record

Work item: `rex-long-running-delivery-transitions-2026-07-19`.

### Reuse ladder

1. **Eliminate the construct:** not applicable. The user-visible contract still
   needs a durable, resumable decision for each accepted feature; removing the
   transition state would move that semantic choice back into AIOS or prose.
2. **Reuse repository code:** reuse the existing
   `rex-harness/src/domain/long-running-delivery.mjs` ledger and the shared
   structured-command/receipt matcher in
   `rex-harness/src/domain/execution-receipts.mjs`. Reuse the existing single
   Rex/AIOS boundary in `scripts/lib/workflows/rex-harness-adapter.mjs` for a
   thin host-facing projection. Do not extend
   `scripts/lib/harness/solo-runtime/loop.mjs`: its generic while-loop,
   `shouldStop`, backoff and iteration counters are host safety mechanics, not
   a feature selector or acceptance state machine.
3. **Language/platform:** JavaScript's immutable object/array copies are
   sufficient for pure ledger transitions. No platform service can establish
   receipt-to-scenario identity; the existing Rex matcher already owns that
   requirement.
4. **Installed dependencies:** none are appropriate. A workflow package would
   add another controller and broaden coupling without replacing the existing
   Rex receipt boundary.
5. **Local expression:** insufficient. Validation of the current feature,
   exact receipt command, retry policy, terminal decision and immutable record
   update must be shared by standalone and AIOS callers; embedding it in an
   AIOS loop or a one-off caller would duplicate policy.
6. **Selected minimum:** add `advanceLongRunningDelivery(ledger, evidence,
   { resolveReceipt })` beside the initializer and export it through the Rex
   public entry. Add only a thin adapter/store seam that persists the opaque
   ledger and returns Rex's decision verbatim. It must accept a host iteration
   result as evidence, never calculate feature order, retry, completion or
   human-gate itself.

The selected construction keeps the feature acceptance state in its Rex domain
and leaves AIOS responsible only for receipt capture, one bounded fresh-context
execution, ContextDB/checkpoint persistence and host safety stops.

## Rex long-running transition test-scope

Work item: `rex-long-running-delivery-transitions-2026-07-19`.

### Goal and boundaries

Complete the next vertical slice of the Rex-owned delivery ledger. Rex must
validate evidence for the one current feature and return a typed decision; AIOS
may durably retain that opaque result and run at most the one feature that Rex
issued. This slice does not make the generic AIOS solo loop select features,
does not let host prose decide acceptance, and does not add a second workflow
engine or new dependency.

### Acceptance mapping

| Required behavior | Stable public seam | Observable assertion |
| --- | --- | --- |
| F1 success advances only to F2. | `advanceLongRunningDelivery()` from the Rex public entry. | A matching zero-exit F1 receipt changes F1 to accepted, returns `continue` for F2, and leaves no host-selected alternative. |
| A nonzero receipt retries only the same feature. | Rex transition result. | A receipt whose executable/args/cwd match F1 increments F1 retry count and returns `retry` for F1 while budget remains. |
| Evidence cannot cross feature boundaries. | Rex transition result. | A receipt declared for F2 while F1 is current produces `blocked`, has no selected next feature, and does not alter F2. |
| Terminal decisions are explicit and never pick a next feature. | Rex transition result. | Missing or malformed evidence returns `blocked`; unresolved acceptance or retry exhaustion returns `human-gate`; accepted final feature returns `completed`; each has no `currentFeatureId` in its decision. |
| AIOS is only an opaque host. | A dedicated long-running delivery store/adapter under `scripts/lib/workflows/`. | Starting, reloading after a simulated restart, and executing one supplied host callback preserves the Rex ledger and returns the Rex-issued decision; the host callback receives the current Rex feature but no selector callback. |

### Test seams and independently failing slices

1. Extend `rex-harness/tests/workflows/long-running-delivery.test.mjs` through
   the public `src/index.mjs` API. Use two feature scenarios with deliberately
   distinct structured node arguments, capture real local receipts, and first
   fail on the absent `advanceLongRunningDelivery()` export rather than fixture
   setup.
2. In the same public Rex suite, demonstrate F1 success -> F2, F2 success ->
   completed, matching F1 nonzero -> retry, cross-feature F2 receipt ->
   blocked, missing evidence -> blocked, and unresolved/budget-exhausted ->
   human-gate. No test may substitute a hand-written receipt object, a generic
   zero exit, mock calls, or weaker assertion for the scenario match.
3. Add an isolated AIOS adapter/store test in the established workflow-adapter
   test family. It must create a real Rex ledger, persist and reload it from a
   temporary project root, invoke exactly one supplied host callback with the
   Rex decision, and verify that the returned decision is the direct Rex result
   after the callback's receipt evidence. The callback may be synthetic, but
   its transition must use the real Rex receipt resolver.

### Test prohibitions and completion criteria

- Do not test private selector helpers, internal callback counts, or an AIOS
  reimplementation of feature ordering.
- Do not gain GREEN by deleting an assertion, accepting an unrelated receipt,
  weakening the status/decision assertions, or marking a failing command as a
  passing baseline.
- The Rex domain slice completes only once all six transition cases are
  scenario-bound and green. The AIOS slice completes only once restart and
  exactly-one-iteration behavior are demonstrated without a host next-feature
  selector.

### F1 transition slice review

Reviewed scope: `rex-harness/src/domain/long-running-delivery.mjs`, the
associated public export, and `rex-harness/tests/workflows/long-running-delivery.test.mjs`.

#### Standards review

| Severity | Location and evidence | Impact | Action |
| --- | --- | --- | --- |
| None | `advanceLongRunningDelivery()` reuses the domain's feature ledger and shared exact command/receipt matcher instead of importing AIOS or duplicating a receipt parser. | The semantic transition stays portable and host-independent. | Preserve the Rex-only dependency direction. |
| None | The public test captures F1's receipt through the standalone receipt store, imports through `src/index.mjs`, and asserts both record status and returned decision. | The behavior is observable without mocks, private helpers, or host feature selection. | Preserve this test seam for later states. |
| Low | The next-feature search is intentionally limited to the ordered records after the current feature. | This makes order explicit, but later transition tests must cover corrupt/out-of-order ledgers before a persisted host consumes them. | Add invalid-ledger coverage with the broader transition suite. |

Standards verdict: accepted for the F1-to-F2 vertical slice; the focused public
test passed with `receipt:3f843f85-539a-4663-981e-286848d5fabc` and the
refactor check passed with `receipt:c900f3cb-a6b4-4b03-b011-5a3096363eb3`.

#### Specification review

| Severity | Requirement status | Evidence and impact | Required action |
| --- | --- | --- | --- |
| Satisfied (partial) | A zero-exit receipt for the current F1 scenario accepts F1 and returns Rex's `continue` decision for ordered F2. | The public API has no AIOS input beyond receipt resolution; F2 was not selected by the caller. | Retain as the first evidence-transition slice. |
| Blocker | Retry, invalid/missing/cross-feature blocking, unresolved acceptance, retry exhaustion, and final completion are not yet typed transitions. | The current implementation throws for these cases instead of returning the user-required explicit Rex decisions. | Create public RED cases for those terminal/retry outcomes, then add only the corresponding Rex-domain behavior. |
| Blocker | No AIOS opaque-ledger store/one-iteration adapter exists. | There is no restart or host-boundary evidence that AIOS consumes, rather than recomputes, Rex's decision. | Add the isolated adapter/store vertical slice only after the Rex decisions above are covered. |

Specification verdict: changes requested for the long-running objective. The
F1 transition is complete evidence for one behavior, not a claim that the
delivery controller or host integration is complete.

## Rex terminal-decision execution graph

Work item: `rex-long-running-delivery-terminal-decisions-2026-07-19`.

```text
R1. Rex typed decision scenarios (RED)
        |
        v
R2. Rex retry/blocked/human-gate/completed transitions (GREEN)
        |
        v
R3. Rex public regression + receipt mismatch cases
        |
        +--------------------------+
                                   v
A1. AIOS opaque-ledger store/one-iteration adapter
                                   |
                                   v
A2. Restart + host-boundary scenario
```

| Step | Input and completion condition | Dependency and safe failure point | Verification evidence |
| --- | --- | --- | --- |
| R1 | Existing F1→F2 ledger plus distinct real F1/F2 scenario commands. Complete when independent public tests fail for retry, blocked, human-gate, and completed decisions. | No dependency. A fixture/receipt failure is not a valid RED; repair it before changing the domain. | `node --test rex-harness/tests/workflows/long-running-delivery.test.mjs` with a nonzero receipt and the expected missing decision behavior. |
| R2 | R1 RED scenarios. Complete when Rex alone validates the current feature receipt and returns exactly one of retry, blocked, human-gate, or completed without `currentFeatureId` on terminal decisions. | Depends on R1. Never ask AIOS to classify evidence, choose a feature, or count retries. | Same public Rex suite with actual zero/nonzero receipts. |
| R3 | R2 green. Complete when an F2 receipt submitted during F1 is rejected as blocked and a same-exit unrelated command cannot advance either record. | Depends on R2. Any command mismatch returns to Rex-domain validation rather than adapter work. | Targeted Rex suite plus the shared receipt matcher. |
| A1 | Completed R2/R3 Rex API. Complete when an AIOS store writes/reloads the opaque Rex ledger and a one-shot host callback receives only the issued feature/decision. | Depends on Rex semantics. A store may not derive retry, next feature, terminal status, or accepted evidence. | Isolated temporary-root adapter/store test. |
| A2 | A1 persistence seam. Complete when a simulated restart reloads the exact ledger and the supplied one-shot callback's evidence produces the same Rex decision returned to the caller. | Depends on A1. Any host selector, loop semantic, or prose completion claim fails the boundary. | Adapter test with real Rex receipt resolver and two feature scenarios. |

Critical path: `R1 -> R2 -> R3 -> A1 -> A2`. R1/R2/R3 are a single Rex
domain slice; A1/A2 must wait because otherwise the host would become the
source of an unfinished state machine.

### Terminal-decision minimal-construction record

1. The remaining decisions cannot be removed: without a typed Rex result, the
   host must guess whether to retry, stop, or select another feature.
2. Reuse `advanceLongRunningDelivery()` and its existing immutable ledger
   update path. Reuse `normalizeExecutionReceipt()` and
   `assertExecutionReceiptMatchesCommand()` for every receipt outcome.
3. JavaScript conditionals and immutable record copies are adequate; this is a
   closed state transition, not a new runtime service.
4. No dependency is appropriate: adding one would duplicate an existing
   receipt/state boundary and widen the host coupling.
5. A caller-local expression is unsafe because standalone and AIOS callers
   would diverge on retry count, command mismatch and terminal decisions.
6. The smallest new construction is a small typed-evidence normalizer plus
   result constructors in the existing Rex domain module. All terminal
   decisions omit `currentFeatureId`; only `continue` and `retry` carry the
   already-selected current feature. No AIOS file changes in this slice.

## Rex terminal-decision test-scope

Work item: `rex-long-running-delivery-terminal-decisions-2026-07-19`.

### Scope and stable seam

The public seam remains `advanceLongRunningDelivery()` exported by
`rex-harness/src/index.mjs` and exercised through
`rex-harness/tests/workflows/long-running-delivery.test.mjs`. A temporary
scenario script reads a temporary control file; its executable, args and cwd
remain constant while the file switches its real exit code. This creates both
zero and nonzero receipts for the same persisted scenario without fabricating
a receipt object or changing command identity.

### Decision matrix

| Input to current F1 | Required Rex result | Public assertion |
| --- | --- | --- |
| Matching F1 zero receipt | `continue` for F2, or `completed` if it is final | Accepted record and one Rex-selected current feature only. |
| Matching F1 nonzero receipt below budget | `retry` for F1 | F1 retry count increments; F2 remains pending. |
| Matching F1 nonzero receipt at budget | `human-gate` | No decision `currentFeatureId`; no F2 selection. |
| Missing/malformed evidence or evidence declared for F2 while F1 is active | `blocked` | No decision `currentFeatureId`; neither F1 nor F2 becomes accepted. |
| Explicit `acceptance-unresolved` for F1 | `human-gate` | No decision `currentFeatureId`; human input is required before resuming. |
| Matching F2 zero receipt after F1 acceptance | `completed` | Both records accepted and no next feature. |

### Test constraints and completion criteria

- The F1 and F2 scenarios use different script/argument identities, so an F2
  receipt cannot accidentally satisfy F1 merely by having the same exit code.
- Every receipt is captured by `captureStandaloneExecutionReceipt()` at the
  temporary root; no test writes a receipt JSON or mocks `resolveReceipt`.
- The initial RED must fail because current code throws/does not return the
  required typed decision for the matrix, not because the temporary script or
  command cannot run.
- This Rex domain slice is complete only when each matrix row passes through
  the public API and terminal decisions omit `currentFeatureId`. AIOS adapter
  code remains out of scope until then.

## Rex terminal-decision code review

Review scope: `rex-harness/src/domain/long-running-delivery.mjs`, its public
export in `rex-harness/src/index.mjs`, and
`rex-harness/tests/workflows/long-running-delivery.test.mjs`. The review used
the terminal-decision contract above and real focused receipts
`receipt:54370367-b0b6-469e-bc2b-ad355acb44e6` and
`receipt:d751e7ba-57cb-47ba-b157-f26752da2200`; both ran the public test suite
with exit code zero.

### Standards review

| Severity | Finding | Evidence, impact, and action |
| --- | --- | --- |
| Passed | The state transition remains in the Rex domain boundary. | The host supplies only `resolveReceipt`; retry counting, acceptance, terminal status, and feature selection remain in `advanceLongRunningDelivery()`. No AIOS loop or adapter was added. |
| Passed | Invalid, unresolved, and command-mismatched receipts fail closed. | `resolveFeatureReceipt()` checks receipt identity and delegates exact `{ executable, args, cwd }` matching to `assertExecutionReceiptMatchesCommand()` before any transition. It returns `blocked` instead of accepting an unverifiable result. |
| Passed | Immutable ledger updates have a narrow, reusable shape. | `withFeatureEvidence()` and `withTerminalDecision()` preserve the active feature and pending successors for retry, blocked, and human-gate outcomes. No duplicate host-side transition helper was introduced. |

### Specification review

| Severity | Finding | Evidence, impact, and action |
| --- | --- | --- |
| Passed | All required decision kinds are implemented through the public API. | The focused suite covers current-feature zero receipt (`continue`/`completed`), nonzero retry, exhausted retry `human-gate`, missing/cross-feature `blocked`, and explicit unresolved acceptance `human-gate`. Terminal decisions omit `currentFeatureId`. |
| Required before A1 | R3 lacks a direct public assertion for a forged feature identity paired with a different same-exit command. | The implementation rejects it through exact command matching, but the current cross-feature test declares F2 and is blocked before matcher invocation. Add a public test that submits the real F2 receipt while claiming F1, assert `blocked`, no decision `currentFeatureId`, and both feature states remain unadvanced. This is required anti-fabrication regression coverage before the AIOS adapter work. |
| Out of scope / still missing | AIOS opaque-ledger persistence and one-iteration host adapter do not exist yet. | This Rex-only slice intentionally has no store/reload boundary or host-callback test. Do not represent the current Rex decision coverage as proof that AIOS can persist or resume the ledger; implement A1/A2 only after R3's direct mismatch regression is green. |

Review verdict: the Rex terminal-decision implementation satisfies the current
decision matrix, but the R3 command-mismatch regression test remains a
required follow-up. AIOS opaque-ledger persistence remains unimplemented.

### R3 command-mismatch regression closure

The follow-up public regression uses the same real F2 receipt while declaring
`featureId: 'checkout-validation'` for active F1. It now asserts `blocked`, no
decision `currentFeatureId`, F1 still `active`, and F2 still `pending`. The
focused suite passed under real receipt
`receipt:6a6f8f77-4e14-44a4-b359-6128b749dccd`; this demonstrates that a
same-exit command from another feature cannot be relabeled to advance the
ledger. R3 is therefore complete. The separate AIOS opaque-ledger persistence
and one-iteration adapter work remains unimplemented and is the next A1/A2
slice.

## AIOS opaque long-running ledger adapter test-scope

Work item: `aios-rex-opaque-long-running-adapter-2026-07-19`.

### User goal and non-goals

AIOS must make a Rex long-running delivery resumable without becoming a second
workflow engine. It needs an ownership-specific JSON envelope under
`.aios/workflow-activations/long-running-deliveries/` that can persist and
reload the complete Rex `{ ledger, decision }` result. One adapter invocation
may call one supplied fresh-context host callback, pass through the stored Rex
decision, give its typed evidence to `advanceLongRunningDelivery()`, persist
the returned Rex result, and return that result unchanged.

Out of scope: changes to `solo-runtime/loop.mjs`, any AIOS next-feature
selection, retry counter, terminal-decision interpretation, prose completion
rule, generic activation-store migration, task queue redesign, or another
workflow/runtime engine.

### Acceptance mapping and test seam

| Acceptance behavior | Public test assertion | Seam |
| --- | --- | --- |
| A real Rex-created ledger survives an AIOS persistence boundary. | A temporary project root writes then reloads the full `{ ledger, decision }` record; its decision remains Rex's initial `continue` for F1. | `persistAiosLongRunningDelivery()` and `readAiosLongRunningDelivery()` in a dedicated workflow-store module. |
| AIOS runs at most one issued feature per adapter call. | After a simulated restart (only the persisted record is used), the test callback runs exactly once and receives the persisted Rex `continue` decision for F1. | `runAiosLongRunningDeliveryIteration()` callback contract. |
| Real typed evidence advances only through Rex. | The callback returns F1 `feature-verification-observed` evidence backed by a real standalone receipt; the adapter returns and persists Rex's `continue` decision for F2 verbatim. | The adapter calls `advanceLongRunningDelivery()` with the supplied resolver. |
| The host cannot semantically control the ledger. | The test contains no host next-feature selector, retry counter, or terminal-status branch; F2 follows only from the persisted Rex result. | The adapter forwards an opaque record and does not inspect feature ordering/state. |

The smallest independently failing vertical slice is one temporary-root test
with a two-feature Rex ledger, a real baseline receipt, a real F1 receipt, one
store/reload boundary, and one callback. It observes the adapter public API,
not internal file helpers or callback invocation internals alone. It must not
mock receipt resolution or write a receipt JSON. Deleting assertions, skipping
the restart, substituting a fabricated receipt, or deriving a next feature in
the test is prohibited.

Completion requires this single vertical slice to pass, including a persisted
post-advance record with Rex's F2 `continue` decision. A broader harness
integration remains a separate subsequent change.

## AIOS opaque long-running ledger adapter code review

Review scope: `scripts/lib/workflows/rex-long-running-delivery-store.mjs`,
`scripts/tests/rex-long-running-delivery-store.test.mjs`, and the A1/A2 test
contract above. The focused test passed with real receipt
`receipt:5c33fd31-4d42-42f1-93d7-fb33c255f3d7` after the RED receipt
`receipt:a3414010-f557-4722-8e1a-2cc334119946` established the missing public
boundary.

### Standards review

| Severity | Finding | Evidence, impact, and required action |
| --- | --- | --- |
| Blocker | The host callback receives the full rehydrated `ledger`. | `runAiosLongRunningDeliveryIteration()` passes `{ deliveryId, ledger, decision }`. JSON rehydration removes Rex's object freezing, so an accidental or hostile callback can mutate feature state before the adapter calls Rex. Pass only the issued Rex decision (and non-semantic delivery metadata if needed); keep the ledger private to the adapter, then add a public assertion that the callback cannot receive it. |
| Passed | The store has a dedicated path and fail-closed identity boundary. | The record uses a separate `long-running-deliveries` directory, atomically writes the full Rex `{ ledger, decision }` payload, rejects invalid identifiers, invalid JSON, wrong record kind, and an on-disk delivery ID that does not match the requested ID. |
| Passed | AIOS does not currently calculate feature ordering, retries, or terminal decisions. | The only transition call is `advanceLongRunningDelivery(current.ledger, evidence, { resolveReceipt })`; the returned result is persisted and returned without a host-side decision switch. |

### Specification review

| Severity | Finding | Evidence, impact, and required action |
| --- | --- | --- |
| Partial | The temporary-root scenario proves real baseline/F1 receipts, a reload boundary, one callback invocation, and persistence of Rex's F2 `continue` result. | `scripts/tests/rex-long-running-delivery-store.test.mjs` uses standalone receipt capture/resolution and compares the adapter result to Rex's direct result. Retain this behavior-level test. |
| Blocker | The callback contract is wider than the agreed opaque boundary. | A1/A2 requires AIOS to give the host only Rex's issued `currentFeatureId`/decision, not state it could reinterpret or mutate. Narrow the callback and prove the context is limited before treating A1/A2 as complete. |
| Out of scope | No generic solo-loop integration was added. | This matches the non-goal and must remain true for the narrow fix. |

Review verdict: changes required. The persistence/result-forwarding seam is
sound, but callback isolation must be corrected and covered before A1/A2 can
be considered complete.

## AIOS long-running callback isolation minimal-construction record

Work item: `aios-rex-long-running-callback-isolation-2026-07-19`.

1. Removing the isolation requirement is not valid: a persisted JSON ledger is
   mutable after reload, so exposing it to host execution would make AIOS a
   possible semantic controller.
2. Reuse the dedicated
   `rex-long-running-delivery-store.mjs` callback boundary. The existing
   `current.ledger` already remains private there and needs no new store,
   adapter, or Rex API.
3. Node's native object construction is sufficient for a narrow forwarded
   context; no platform API is needed.
4. No dependency is suitable: a library would add coupling without protecting
   a one-field boundary.
5. A local replacement of `{ deliveryId, ledger, decision }` with
   `{ deliveryId, decision }`, plus a behavior-level context-shape assertion in
   the existing public test, is clear, testable, and prevents host mutation of
   the Rex ledger.
6. No new construction is needed. Keep the result persistence and Rex advance
   call unchanged; do not introduce a generic callback framework.

## AIOS long-running callback isolation test-scope

Work item: `aios-rex-long-running-callback-isolation-2026-07-19`.

The user-visible host contract is that one fresh-context callback receives
only the Rex-issued execution instruction: the durable delivery identifier and
Rex's `decision` with its current feature ID. It must not receive the ledger.
The callback still runs exactly once, returns typed evidence for that issued
feature, and the adapter persists/returns Rex's F2 `continue` result.

Out of scope: changing the persisted record format, changing Rex
`advanceLongRunningDelivery()`, copying the ledger before passing it to the
host, generic callback APIs, retry/terminal policy, or any AIOS loop file.

The stable public seam is
`runAiosLongRunningDeliveryIteration()` exercised by
`scripts/tests/rex-long-running-delivery-store.test.mjs`. The existing
temporary-root real-receipt scenario is retained; its callback assertion will
compare the entire context with `{ deliveryId, decision }`, so the current
`ledger` field produces an independent behavioral RED. Completion requires
that assertion and all existing persistence/one-callback/Rex-result assertions
to pass without weakening any of them.

## AIOS long-running callback isolation code review

Review scope: the dedicated long-running store and its public temporary-root
test. The original callback leak was demonstrated by
`receipt:72a12e7c-325e-4fc3-99cb-b47d06043f2a`; the narrowed contract passed
with real receipt `receipt:0aec96b0-5983-4f99-803f-bdbe53eb294a`.

### Standards review

| Severity | Finding | Evidence and impact |
| --- | --- | --- |
| Passed | The callback context contains only `deliveryId` and the persisted Rex `decision`. | The complete-object assertion in the public test rejects any leaked `ledger`; the adapter keeps `current.ledger` private until it calls Rex. |
| Passed | The minimal change preserves the ownership boundary. | The code removes one forwarding field only. It does not change record storage, receipt resolution, Rex transition, retry accounting, terminal semantics, generic activation handling, or an AIOS loop. |
| Passed | The test remains behavior-focused. | It retains real baseline/F1 standalone receipts, restart-style reload, exactly-one callback count, direct Rex-result comparison, and persisted F2 decision assertion. |

### Specification review

| Severity | Finding | Evidence and impact |
| --- | --- | --- |
| Passed | A1/A2's opaque host boundary is now enforced. | The host receives a Rex-issued current-feature decision but no mutable semantic ledger; only Rex evaluates callback evidence and supplies the persisted F2 decision. |
| Out of scope | Generic harness/solo-loop wiring remains absent. | This is intentional: the verified seam is a dedicated one-iteration adapter, not a second controller. Future callers must use this boundary rather than reconstructing selection logic. |

Review verdict: no remaining findings in this bounded callback-isolation
change. The A1/A2 temporary-root store/reload/one-iteration contract is now
covered; broader runtime adoption remains separate work.

## Live evidence hardening TDD GREEN observation

The focused agent-promotion contract now rejects the legacy artifacts that
`aios agents smoke` could previously mint without starting a client: a v1
`status: "pass"` smoke file, a v1 `status: "verified"` provenance file, and
unbound compression metric records leave `rex-planner` blocked. The positive
control uses a schema-v2 bundle tied to one `aios.harness.one-shot.v1`
invocation: client/agent/session identity, command and output digests, a zero
exit code, one receipt ID, provenance for that same receipt, and matching
`pre_send`/`post_receive` metric reference IDs. Only that complete managed
bundle can verify a projected agent; candidate-only agents remain blocked.

Implementation ownership is deliberately narrow: the shared
`scripts/lib/evidence/live-execution.mjs` validator owns the managed-evidence
contract, while `scripts/lib/agents/catalogue.mjs` only locates candidate files
and asks that validator whether they are admissible. This avoids duplicating
schema and identity rules in the catalogue and leaves the smoke writer as the
next bounded slice.

Command actually run: `rtk node --test scripts/tests/ecc-agent-workflow.test.mjs`.
Observed result: exit 0, 16 passing tests, 0 failures. The Rex receipt for the
GREEN run is `receipt:b56ad730-f2e1-4547-afd8-081a22c3428f`.

## Live evidence hardening TDD REFACTOR observation

No production refactor was applied in this stage. The review found that the
smallest maintainable split is already present: `live-execution.mjs` owns the
complete validation contract and returns only a validity result plus identity;
the agent catalogue owns filesystem discovery and policy presentation. Moving
file I/O into the validator or duplicating the contract in each consumer would
weaken encapsulation and make client/agent rules drift.

The test diff remains behavior-oriented. The regression creates the exact
legacy self-attested v1 bundle and observes that `rex-planner.workflowEnabled`
is false. Its positive control observes promotion only for a v2 bundle bound
to one managed invocation and both compression directions; it does not assert
private helper calls, write ordering, or implementation types. Candidate-only
agents remain disabled even with valid evidence, retaining the lifecycle
boundary.

Command actually re-run for the refactor check:
`rtk node rex-harness/bin/rex-harness.mjs receipt --root /Users/rex/codes/aios -- node --test scripts/tests/ecc-agent-workflow.test.mjs`.
Observed result: exit 0; the receipt is
`receipt:33476344-8ebc-4d7a-919c-d01f036490ff`. `rtk git diff --check` also
completed without whitespace errors.

## Live evidence hardening standards and specification review

Review scope: `scripts/lib/evidence/live-execution.mjs`,
`scripts/lib/agents/catalogue.mjs`,
`scripts/lib/agents/smoke.mjs`, and the corresponding focused tests.

### Standards review

| Severity | Finding | Evidence, impact, and action |
| --- | --- | --- |
| Pass | Validation policy has one owning module. | `live-execution.mjs` contains the schema-v2, identity, runner, digest, provenance, and metric-reference checks; `catalogue.mjs` retains only filesystem discovery. This is a narrow, reusable agent/client boundary with no duplicate parser or cyclic dependency. Keep this split. |
| Pass | The regression is behavior focused. | `ecc-agent-workflow.test.mjs` observes whether a projected agent becomes `workflowEnabled`, comparing old static artifacts with a complete managed bundle. It does not assert helper calls, file ordering, or private data shapes. Keep the public-state assertions. |
| Blocker | The smoke writer still emits misleading v1 trust-shaped files. | `scripts/lib/agents/smoke.mjs` lines 65-124 write `status: "pass"` / `status: "verified"` and synthetic compression data without invoking a client, while `scripts/lib/lifecycle/agents.mjs` returns exit 0 whenever roles exist. Although the new catalogue rejects those files, the command still says it successfully recorded smoke. Replace the default record mode with a fail-closed blocked result that writes no promotion artifacts. Only an explicit real managed one-shot execution may write schema-v2 evidence. |

### Specification review

| Severity | Finding | Evidence, impact, and action |
| --- | --- | --- |
| Pass | Legacy promotion is no longer admitted by the reader. | The new legacy v1 regression passes in `scripts/tests/ecc-agent-workflow.test.mjs`; it observes `rex-planner.workflowEnabled === false`. Matching v2 identity, receipt, and bidirectional metric refs are required before a projected agent is enabled. |
| Blocker | The requested no-fabrication behavior is only partially delivered. | The user requirement is that agents cannot manufacture smoke/provenance/metrics proof. The current producer still creates v1 pass artifacts and a CLI success status, even though downstream validation rejects them. Add a true writer contract: no live runner -> no trust-bearing files and nonzero/blocked command result; successful v2 evidence must derive command, args digest, output digests, exit code, receipt, and compression refs from the same real invocation. |
| Scope boundary | Local v2 evidence is not cryptographic remote attestation. | A process with arbitrary write access to the workspace can alter any local JSONL or artifact. The goal here is to stop AIOS code paths from self-attesting; a hostile root-level actor requires a separately trusted signed runner. Document this limit and do not overclaim remote-proof security. |

Verdict: REJECTED for the full no-fabrication requirement until the smoke writer
is converted to fail closed and has real-runner coverage. APPROVED only for
the bounded catalogue-reader change that rejects legacy static evidence.

## Agent smoke writer hardening test scope

### User goal and explicit non-goals

The `aios agents smoke` command must never claim a live agent passed merely
because AIOS wrote JSON or compressed locally invented text. By default it must
not write promotion evidence. A live attempt must be explicit, must run one
managed one-shot client per agent, and may write schema-v2 smoke, provenance,
and metric references only from that invocation's actual command result and
both real compression packets.

Out of scope for this slice: running a paid/remote client during repository
tests, proving that an arbitrary root-level process cannot edit local files,
changing client smoke writers, and signed external attestation. The required
test seam injects a managed one-shot runner and uses temporary directories; it
does not pretend the injection is a live external client run.

### In-scope observable behavior

| Acceptance behavior | Public observable assertion | Test seam |
| --- | --- | --- |
| No explicit live authorization means no trust evidence. | Calling `runAgentsSmoke()` in record mode without `live: true` returns `status: "blocked"`, has `recorded: 0`, and leaves `.aios/agents/smoke/`, `.aios/agents/provenance/`, and compression metrics absent. `runAgentsCommand()` returns nonzero for this blocked request. | Public `runAgentsSmoke()` and `runAgentsCommand()` with a temporary canonical-agent root. |
| A missing client identity cannot be reinterpreted as live. | `live: true` without a supported explicit client returns blocked and writes no trust-bearing artifact. | Public `runAgentsSmoke()` configuration validation. |
| A successful managed invocation is the sole promotion source. | An injected managed one-shot result containing a real command/arguments, exit 0, stdout/stderr and the required smoke acknowledgement produces v2 smoke/provenance whose identity, command digest, output digests, receipt ID, and pre/post metric ref IDs match one temporary-root invocation. The current catalogue can enable only the projected agent with that complete bundle. | `runAgentsSmoke({ live: true, clientId, runOneShotImpl })`, actual turn-compression gateway, and `buildAgentCatalogue()`. |
| A failed or malformed invocation cannot mint a pass. | Nonzero exit, absent managed invocation metadata, missing acknowledgement, or failed required compression yields a failed/blocked report for that agent and no v2 smoke/provenance artifact. | Same public runner seam; verify on-disk absence rather than helper call counts. |

### Minimum vertical slice and anti-fabrication rules

The first independently failing test replaces the historical test that expected
`aios agents smoke` to record sixteen static v1 passes. It invokes the public
command without `--live` and asserts a blocked result plus no artifacts; this
fails against the current writer because it creates all v1 files and exits 0.
The GREEN extension supplies a managed-result fixture for one agent and checks
the generated v2 bundle through the catalogue, including both metric reference
IDs. The test must not delete assertions, skip the command, weaken a failed
result into pass, or use an arbitrary prewritten JSON file as positive evidence.

Production design boundary: extend the existing one-shot runner result with
the exact invocation metadata it actually executed, then have the agent-smoke
writer derive hashes and evidence from that result. `live-execution.mjs` remains
the shared consumer validator; the writer must not duplicate its admission
policy. If an actual live run is desired after implementation, it requires the
operator's explicit `--live --client` command and remains a separate, billable
operation.

## Agent smoke writer hardening TDD RED observation

Exact command: `rtk node --test scripts/tests/aios-orchestrator-agents.test.mjs`.
The new public command test failed as intended: 14 tests passed and 1 failed.
The failure was `Expected values to be strictly equal: 0 !== 1` at the
assertion that a no-`--live` `aios agents smoke` request must be blocked. The
real receipt is `receipt:6ab120d2-53be-453d-9e94-03325b85f5f4` and recorded
exit code 1 for the focused suite.

This is an honest behavior RED, not test infrastructure failure: the temporary
root contains canonical agent source, and the old test's same public command
did complete. Its actual behavior is precisely the defect under repair: it
returns success while writing synthetic v1 pass/provenance/metric evidence
without a client invocation.

## Agent smoke writer hardening TDD GREEN observation

The writer is now fail closed by default. `runAgentsSmoke()` returns a blocked
report without creating smoke, provenance, or metric files unless `live: true`
and a client identity are explicit; `runAgentsCommand()` propagates that state
as a nonzero exit. The CLI parser exposes the same boundary as
`aios agents smoke --live --client <name>`.

For a live attempt, the existing managed one-shot runner now returns the exact
command and argument list it executed. The writer performs real pre-send and
post-receive compression around that invocation, requires both packet refs,
requires zero exit and the smoke acknowledgement, then derives v2 execution
hashes and provenance from the returned invocation/stdout/stderr. It writes no
smoke or provenance file when that managed metadata is absent. The consumer
continues to use the shared `live-execution.mjs` validator, so producer and
consumer share one schema boundary rather than accepting a second local format.

The focused command was re-run through Rex:
`rtk node rex-harness/bin/rex-harness.mjs receipt --root /Users/rex/codes/aios -- node --test scripts/tests/aios-orchestrator-agents.test.mjs`.
It exited 0 with 17 passing tests and receipt
`receipt:7c8d50a6-3d24-4589-b11b-8e406c77d599`. Coverage includes no-live
blocking, CLI option parsing, v2 command/output/metric binding, catalogue
promotion of a valid projected agent, and rejection of an invocation missing
managed-runner proof. No paid client was invoked by this test suite.

## Agent smoke writer hardening TDD REFACTOR observation

No production refactor was justified in this stage. The existing split is the
smallest reusable boundary: `live-execution.mjs` owns reader-side admission of
the schema-v2 managed-evidence bundle; `agents/smoke.mjs` owns execution,
compression, and atomic creation of that bundle; `agents/catalogue.mjs` only
discovers artifacts and projects the resulting policy state. Moving command
execution into the validator or copying validation logic into the writer would
couple filesystem policy to execution and risk agent/client schema drift.

The new tests remain user-observable and do not loosen the test contract. They
assert that a normal `agents smoke` request fails closed with no trust files;
that only a managed, zero-exit acknowledged invocation creates a v2 bundle
which enables a projected agent; and that missing managed-invocation metadata
leaves no promotion files. The injected runner is an isolated unit-test seam,
not a claim that a paid external client was contacted. A separately trusted
signed runner would still be needed to defend against a process with arbitrary
write access to the local workspace.

Review commands: `rtk git diff --check -- scripts/lib/evidence/live-execution.mjs
scripts/lib/agents/catalogue.mjs scripts/lib/agents/smoke.mjs
scripts/lib/harness/subagent-runtime/one-shot-runner.mjs
scripts/lib/lifecycle/agents.mjs scripts/lib/cli/parse-args.mjs
scripts/tests/ecc-agent-workflow.test.mjs
scripts/tests/aios-orchestrator-agents.test.mjs` completed without whitespace
errors. The focused test was re-run through Rex with exit 0; its receipt is
`receipt:b1db4104-23f5-43f7-a050-2981ddd47b74`.

## Agent smoke writer hardening specialist security review

### Scope

This review is limited to the new local trust boundary in
`scripts/lib/agents/smoke.mjs`, the managed invocation returned by
`scripts/lib/harness/subagent-runtime/one-shot-runner.mjs`, and its Codex
execution adapter in `scripts/lib/harness/subagent-clients/codex-exec.mjs`.
The risks examined are fabricated execution provenance, accidental remote or
billable client execution, and unsafe propagation of a failed probe into
workflow enablement. No live client was launched for this review.

### Findings

| Severity | Finding | Evidence, impact, and required action |
| --- | --- | --- |
| High | The managed-invocation args can be stale after Codex structured-output fallback. | `runOneShot()` records `invocation.args` after `runClientInvocation()` returns, but `runCodexInvocation()` can call `runCodexStructuredFallbacks()` with a different `fallbackArgs` or `plainFallback` argument list and return that successful result. A live smoke can therefore hash the original rejected args while the acknowledgement and exit code came from a different successful command. Return the exact final command/args from every invocation runner and derive v2 evidence only from that returned execution record. Add a regression that forces a structured-flag fallback, then asserts the persisted digest matches the successful fallback args rather than the first attempt. |
| Medium | The explicit live/billing boundary is not discoverable in CLI help. | `parse-args.mjs` defines `agents smoke --live --client`, but `rtk node scripts/aios.mjs agents smoke --help` displays only `agents list` and `agents doctor`; it neither lists `smoke` nor warns that `--live --client` invokes an external client and may consume quota. Add the command and a clear remote/billable warning to the public help, plus a CLI-help regression. |
| Pass | The basic fail-closed writer boundary is preserved. | Without `live: true`, the public command returns blocked/nonzero and writes no trust files. A passed v2 bundle requires managed-runner metadata, zero exit, acknowledgement, and both compression refs; the catalogue then revalidates identity, receipt, digests, provenance, and metric refs. The focused suites passed in `receipt:4004da65-0714-4014-844a-8b35fc0a35b8`. This remains local traceability rather than protection against a root-level process which can edit workspace files. |

### Specialist verdict

Status: **fail** for the provenance contract until the executed-argument
fallback discrepancy is repaired and covered by a behavior test. Do not
perform a real paid smoke to compensate for this defect. The next bounded TDD
slice should first reproduce the fallback mismatch, then make the invocation
runner return the final executed argument vector, and finally make CLI help
describe the explicit live/billable boundary.

## Final invocation provenance and live-smoke disclosure test scope

### User goal and non-goals

When a managed Codex invocation falls back because a structured-output flag is
unsupported, every downstream evidence writer must receive the final argument
vector that actually produced the result. The public `agents` help must also
make the `smoke --live --client` operation and its possible external/quota
cost visible before an operator opts in.

This slice does not run a real coding client, write promotion evidence, change
the smoke acknowledgement contract, or provide cryptographic protection from a
process with arbitrary local filesystem access. It uses a temporary local fake
`codex` executable solely to reproduce the existing command-line fallback.

### Acceptance mapping

| Acceptance behavior | Observable assertion | Test seam |
| --- | --- | --- |
| Provenance names the actual successful invocation. | A public `runOneShot('codex', { codexOutput })` call first receives a fake `--output-schema` rejection and then succeeds through its fallback. `result.managedInvocation.args` equals the fake executable's successful argv and contains no rejected `--output-schema` flag. | Temporary executable selected only through a test-local `PATH`; the fake records each argv and never contacts a model service. |
| Normal invocation provenance stays stable. | A successful no-fallback call retains the exact primary args reported by the execution runner. | Existing public one-shot behavior plus the same runner contract. |
| Operators can discover and understand the cost gate. | `node scripts/aios.mjs agents smoke --help` names the smoke subcommand, requires explicit `--live --client <name>`, and warns that it invokes an external client and may consume quota or incur charges. | Real CLI help entry only; no smoke execution. |

### Test boundary and vertical slice

The smallest independently failing vertical slice is the fake-Codex fallback:
the fake exits nonzero only while its argv includes `--output-schema`, then
returns an acknowledgement on the first fallback invocation. Before the fix,
`runOneShot()` reports the first rejected args even though the observed success
came from the fallback; after the fix, its public managed-invocation metadata
must match the final captured argv. The help assertion is a second public
behavior in the same cohesive CLI safety change.

Tests must not bypass the fallback by deleting structured-output input, inspect
only mock call counts, weaken the argv equality assertion, or call an installed
Codex/Claude/Gemini binary. The focused command is
`node --test scripts/tests/harness-runtime.test.mjs scripts/tests/aios-cli.test.mjs`.

### Final invocation provenance RED observation

The focused command was run through rex receipt
`receipt:a8f3e232-ae24-4a27-b610-0ba5ae5fd68b` and exited with status `1`.
The temporary test-local `codex` executable observed two argv vectors: the
first included `--output-schema` and failed with `unexpected argument
'--output-schema'`; the second omitted that rejected flag and produced the
acknowledgement. `runOneShot()` nevertheless reported the first vector as
`managedInvocation.args`. Separately, `agents smoke --help` printed only
`agents list` and `agents doctor`, omitting the smoke subcommand, `--live`,
`--client <name>`, and the external quota/charge warning.

This is a valid behavioral RED: the public fallback result and public help
output disagree with the scoped user-facing contract. The fixture itself is
healthy because the normal primary-argv regression passes and no installed
model client is invoked.

### Final invocation provenance GREEN observation

After the bounded implementation, the same focused command completed with
status `0` under rex receipt `receipt:291c669e-4188-4cc7-ace0-1597de889b69`.
The fallback regression now observes that `managedInvocation.args` is exactly
the successful fallback argv, the primary-path regression retains its one
executed argv, and the public help test finds `agents smoke`, `--live`,
`--client <name>`, plus the external quota/charges warning.

The implementation keeps execution ownership in the client runners:
`spawn-result.mjs` carries a copied `executedArgs` vector, generic spawn and
Codex primary/fallback paths attach their actual final vector, and the
one-shot evidence boundary consumes only that returned vector. The help change
is confined to the agents maintenance command documentation.

### Final invocation provenance refactor review

The fixture logging expression was simplified without changing the fake-client
boundary. The focused suite remained green under rex receipt
`receipt:e866481a-f30e-499a-8fbc-4739cc144f63`; `git diff --check` also exited
with status `0`.

The test diff remains behavior-facing: it invokes public `runOneShot()` through
a process selected by a temporary `PATH`, captures the argv actually received
by that process, and invokes public CLI help. It does not mock an internal
fallback decision, assert private call counts, weaken equality to containment,
or invoke an installed coding client. The runner change stays centralized in
the common normalized result contract and leaves one-shot free of
client-specific fallback branches.

### Final invocation provenance standards and specification review

Review scope was limited to the final-argv propagation and `agents smoke` help
slice in `spawn-result.mjs`, `invocation-runner.mjs`, `codex-exec.mjs`,
`one-shot-runner.mjs`, `maintenance.mjs`, and their two focused test files.
`git diff --check` passed and the green/refactor receipt is
`receipt:e866481a-f30e-499a-8fbc-4739cc144f63`.

**Standards review: no findings.** The shared normalized-result module owns the
copied argv metadata; generic and Codex-specific runners attach it where they
know the final process arguments; the evidence layer has no Codex conditional.
The temporary executable is isolated under a test-created directory and is
removed in `finally`, with platform-specific launch shims retained.

**Specification review: no findings.** The fallback test checks exact argv
equality against the successful fake process, explicitly proves the rejected
schema argument is absent, and preserves the primary-path behavior. The help
test invokes the public CLI and requires the command, opt-in flags, client
selection, and external-cost language. No real client, promotion artifact, or
smoke workflow is executed. Other pre-existing migration changes visible in
the dirty worktree were not treated as part of this bounded review.

### Final verification for the provenance slice

Fresh focused verification completed with `109` passing and `0` failing tests:
`node --test scripts/tests/harness-runtime.test.mjs
scripts/tests/aios-cli.test.mjs`. `git diff --check` also exited `0`.

The required broader `npm run test:scripts` command was also run. Its workflow
policy suite (`63/63`) and standalone rex-harness suite (`86/86`) passed, but
the root command exited `1` in the rex integration suite because sixteen
historical `.skillopt` fixture files are absent and one agent-provider test is
correctly blocked by missing smoke, metrics, and provenance promotion evidence.
Those failures are outside this final-argv/help slice; no live client was run
and no synthetic promotion evidence was created to mask them. `node
scripts/aios.mjs doctor` exited `0`, reporting the expected ownership-safe
legacy Superpowers projection conflict and unrelated browser/MCP configuration
warnings.
