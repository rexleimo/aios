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
- `work-residue`: the retired `.pi/skills` projection is gone and its test passes. deps: work-triage.
- `work-win-colon`: the 5 evolution-integration tests pass on Windows; no filename contains `:`. deps: work-triage.
- `work-fixture-refresh`: the 5 rex tests pass and the pin derives from current skill content instead of a frozen hash. deps: work-triage. Needs a Decision Ticket (regenerate vs re-certify).
- `work-stale-code`: doctor-bootstrap-task test and implementation agree on one reason code. deps: work-triage.
- `work-adjudicate`: 5 files adjudicated and fixed. deps: work-triage.
- `work-wire`: every fixed family is reachable from a suite and CI runs it. deps: all fix items — wiring a still-failing file would turn the gate red.
- `work-snapshot-refresh`: the unwired baseline shrinks by exactly the wired count (guard W3 forces this). deps: work-wire.

- frontier (ready now): work-env-py, work-residue, work-win-colon, work-stale-code, work-adjudicate.
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
