# Triage the 82 test files that no test entry reaches (23 currently faili...

> AIOS Planning Contract (schema v3)
> created: 2026-09-18T15:44:58.220Z
> client: pi
> source: auto-gate
> route: implement

## Objective

Triage the 82 test files that no test entry reaches (23 currently failing across 14 files): classify every failure as environment-dependent, state-assumption, or genuine rot with evidence, then wire the files into suites and fix the genuinely rotted ones.

## Route skills

1. `rex-planning`

## Tasks

- [ ] **t1-understand**: Clarify objective: Triage the 82 test files that no test entry reaches (23 currently failin — _Objective restated; constraints listed_
- [ ] **t2-plan**: Break work into executable tasks — _Plan tasks updated beyond scaffold if needed_
- [ ] **t3-implement**: Implement changes — _Code changes match objective_
- [ ] **t4-verify**: Verify with tests/checks — _Evidence recorded (command or artifact path)_

## Progress

- status: active

## Decision Log

- (none yet)

## Acceptance

- Complete planned tasks and record verification evidence.

## Next Actions

- Start with the first pending task.

## Verification evidence

## Delivery plan (rex-planning, activation 4915d930-de87-496f-8254-6501cfaec9a7)

Triage result — 23 failing tests across 14 unreachable files, each classified with a decisive probe:

| class | files | evidence | action |
| --- | --- | --- | --- |
| environment-dependent | platform-smoke | `command -v python3`, `python`, `py` are all empty on this host | test must skip with a stated reason instead of failing |
| local state residue | pi-shipped-content-hygiene | `.pi/skills/typesafe-ai` exists in the worktree; the test requires the retired projection to be absent | delete the residue; no code change |
| platform defect (Windows) | evolution-integration | `EINVAL: invalid argument, rename '...\verdicts\.session:session-eval-001.json...'` — `:` is illegal in a Windows filename | real code fix: stop embedding `session:<id>` in a filename |
| stale fixture pin | rex-v2-case-selection, rex-batch-invalid-training-evidence, rex-planning/strict-tdd/test-design-training-evidence | `hash(rex-harness/skill-sources/rex-implement/SKILL.md)` != fixture `gate.baselineHash`; the skill changed 2026-08-02 while `.skillopt` artifacts are 2026-07-18 | decide regenerate fixtures vs re-certify skills, then make the pin self-updating |
| stale reason code | doctor-bootstrap-task | `bootstrap-without-current-task` appears only in the test; the implementation returns `pending-bootstrap` | adjudicate which side is the contract |
| needs adjudication | death-notice, hook-user-prompt, interception-mcp-stdio, automem-loop, ecc-agent-workflow | assertion detail captured per file; test-vs-implementation not yet decided | one adjudication per file |

Work items (stable ids, observable outcome, verification, real deps):

- `work-triage` (done): 23 failures classified. Verification: `probe-triage.mjs` + `probe-context.mjs` output, per-file decisive probe.
- `work-env-py`: `node --test scripts/tests/platform-smoke.test.mjs` exits 0 on a host without a python interpreter, with an explicit skip reason. deps: work-triage.
- `work-residue` (DONE, this turn): the retired `.pi/skills` projection is gone and its test passes. The residue was a single junction `typesafe-ai -> .agents/skills/typesafe-ai` (created by the 2026-09-18 integration-add run; current code routes Pi project scope to `.agents/skills` only, verified via `resolveTargetRoot(pi, project)`), removed surgically without touching the shared-root copy. Deleting it surfaced a SECOND failure in the same file: `REPO_RELATIVE_INVOCATION` matched `scripts\` inside the absolute Windows install-root path `/opt/global-aios\scripts\memory-mcp-server.mjs` that the same test demands 5 lines later — a Windows-only self-contradiction. The third alternative is now anchored to a token boundary (`(?:^|[\s"'`(),=:.])scripts\\`); the first two alternatives keep their exact shapes so doc references like `"scripts/lib/..."` in memo SKILL.md examples stay clean. Verification: `node --test scripts/tests/pi-shipped-content-hygiene.test.mjs` 7/7 (was 1 visible + 1 masked failure). deps: work-triage.
- platform-smoke RE-CLASSIFIED (this turn): the triage recorded it as environment-dependent (absent python interpreter). Wrong — the two real failures are static-analysis rot: (1) the TLS assertion anchored on the first literal `aios-install.ps1`, which now legitimately appears earlier as the preferred LOCAL installer path (implementation is correct: the Tls12 line is the first statement of the generated PowerShell script, holding for both installer paths); (2) the tsx-dispatch assertion still read `dispatch.mjs` after TUI startup moved to `dispatch/helpers.mjs` in the documented 425-line split. Both fixed test-only; 19/19 green. deps: work-triage.
- `work-win-colon`: the 5 evolution-integration tests pass on Windows; no filename contains `:`. deps: work-triage.
- `work-win-colon` (DONE, commit b8d87c47): the 5 evolution-integration failures are fixed and the same defect class was found twice more. Verification: `node --test scripts/tests/evolution-integration.test.mjs` exit 0 (was 5 failures); new pinned test `scripts/tests/artifact-filename-windows-safety.test.mjs` (wired, 5 cases); `npm run test:scripts` 1293/1285/0. Three root causes, not one: (1) verdict.mjs named a file from the raw `session:<id>` id, so the rename hit an NTFS alternate data stream; (2) promotion.mjs allow-listed the colon, so writePromotion stored a stream that readdir never listed and the promotion was lost with `errors.length === 0`; (3) integration.mjs open-coded a second promotion writer that bypassed promotionPath(). deps: work-triage.
- `work-fixture-list` (DONE, commit after b8d87c47): the release fixture copied `scripts/lib/fs/atomic-write.mjs` as one explicit file, so a change to that module's imports broke every preflight fixture run *inside a temp root only* — invisible from the working tree. Now copies the directory, as `scripts/lib/clients` already did. deps: work-win-colon.
- `work-fixture-refresh` (BLOCKED, decision needed): verified that `aios skill certify` writes only `docs/evidence/skill-training/**` and never touches `.skillopt/**`, while all 5 rex tests read `.skillopt/<skill>-2026-07-18/...`. Re-certifying alone therefore cannot turn them green; the decision is what the pin should mean. deps: work-triage.
- `work-stale-code`: doctor-bootstrap-task test and implementation agree on one reason code. deps: work-triage.
- `work-adjudicate`: 5 files adjudicated and fixed. deps: work-triage.
- `work-wire`: every fixed family is reachable from a suite and CI runs it. deps: all fix items — wiring a still-failing file would turn the gate red.
- `work-snapshot-refresh`: the unwired baseline shrinks by exactly the wired count (guard W3 forces this). deps: work-wire.

- `work-evidence-ledger` (NEW, blocked): `aios_capability_evidence` cannot be satisfied for a planning Provider through the documented MCP surface. Every payload returns `delivery ticket schemaVersion must be 1`, including a well-formed `rex.delivery-ticket.v1` with `schemaVersion: 1` **and** `schemaVersion: "banana"` — identical message, so the argument is not being read; the validator inspects some other object (the plan state on disk carries `schemaVersion: 3`). Until this is resolved the planning evidence is delivered in-band as `AIOS_REX_EVIDENCE`. deps: none.
- frontier (ready now): work-stale-code, work-adjudicate.
- done this turn: work-residue (+ the masked Windows regex defect it exposed), platform-smoke re-classified and fixed (2 rot pins).
- `work-stale-code` (DONE, 2026-09-21 second pass): adjudicated — the IMPLEMENTATION is the contract. The c85a51c3 doctor/ctx-bootstrap split deliberately introduced granular codes (`pending-bootstrap` for guideline entries, `pending-stale` for business tasks without a pointer); the runtime reads `.current-task` at startup (`ctx-agent-core/startup-summary.mjs:52`), so an unpointed queue is warn-worthy in both shapes; the old `bootstrap-without-current-task` code and its `.current-task is empty` message exist nowhere else in the repo. Test updated to the current contract. Verification: `node --test scripts/tests/doctor-bootstrap-task.test.mjs` 7/7.
- `work-adjudicate` (DONE, 2026-09-21 second pass): all five files adjudicated — in every case the TEST was stale, never the implementation:
  - `automem-loop`: implementation is correct by explicit in-code rationale (`memo/autopilot.mjs`: automatic writes carry a bare runtime identity, indistinguishable from a forged one, so shared-scope entries land as `candidate` and wait for governed promotion; the declaration still records `turn.verified`). Test now asserts candidate + turn.verified.
  - `death-notice`: test assumed the path concatenates onto the raw workspace root; the resolver derives it from the context-db root with legacy preference (`resolveContextDbRoot`, which normalizes and appends `.aios/context-db`). Test now pins the derived path.
  - `interception-mcp-stdio`: NOT a redaction regression — the test was left inconsistent by 3b689cc4's own incomplete update when the packet moved from replacing the result to riding in `_meta.aios`; the protocol payload passes through unchanged by design (multimodal preservation, c3b91978). Test now asserts pass-through positively plus the packet in `_meta.aios`. Red since 2026-06-11.
  - `hook-user-prompt`: north-star principle — the program never guesses read-only from free text (`isReadOnlyMessage` is a constant false) and the hook payload carries no explicit-intent channel, so a bounded prompt on a single host is `guarded`; `direct` only survives on the hook-error path. Three assertions updated.
  - `ecc-agent-workflow`: no client carries `deprecated: true` any more (the flag was retired with the opencode deprecation), so the compatibility-tier reason can never fire; gemini's fail-closed state is reported through the evidence-gate reasons. Assertion updated.
- `work-wire` (DONE for the fixed families, 2026-09-21 second pass): the 8 fixed families plus the already-green `interception-mcp-proxy` — 9 files — are wired into the `regression` suite in `scripts/test-suites.json`; snapshot refreshed (`knownUnwired` 82 → 73, exactly the wired count, W3 verified). Verification: wiring guard 3/3, full regression `files=124, 1404 tests, 1396 pass, 0 fail`. Still unwired: the rex fixture family (5 files) — `work-fixture-refresh` remains blocked on the A3 regenerate-vs-re-certify decision, so those files stay in the snapshot by design (wiring a still-failing file would turn the gate red).
- `work-snapshot-refresh` (DONE for the wired count): baseline shrank by exactly 9, enforced by guard W3.
- still open: doctor-bootstrap-task (2 fail), and the 5 adjudication files now measure death-notice 1, hook-user-prompt 3, interception-mcp-stdio 1, automem-loop 1, ecc-agent-workflow 1 = 9 failures across 6 files.
- blocked: work-wire (needs every fix), work-snapshot-refresh (needs work-wire), work-fixture-refresh (needs the regenerate-vs-re-certify decision).
- parallelGroups: [work-env-py], [work-residue], [work-win-colon], [work-stale-code], [work-fixture-refresh], [work-adjudicate] — independent domains, no shared state.
- convergenceGate: full regression green, every wired family reachable from a suite, baseline shrunk by exactly the wired count.
- completionClaim: soft for the triage (this turn), hard only when the convergenceGate holds.
- critical path: work-triage -> work-win-colon -> work-wire -> work-snapshot-refresh.

ledger: { is_complete: false, in_progress: [], facts: [23 failures classified across 14 files, python interpreter absent on this host, `.pi/skills` residue present, Windows colon filename defect confirmed in evolution-integration, rex skill changed after the .skillopt fixtures were produced], assignment: { work-env-py: single, work-residue: single, work-win-colon: single, work-stale-code: single, work-adjudicate: single } }


- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## Status

- status: active
