# Eliminate legacy Superpowers discovery paths across AIOS-managed client...

> AIOS Planning Contract (schema v2)
> created: 2026-07-20T00:56:44.801Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

Eliminate legacy Superpowers discovery paths across AIOS-managed clients so new sessions execute Rex-only workflows and cannot create Superpowers spec commits.

## Route skills

1. `rex-minimal-construction`

## Tasks

- [ ] **t1-understand**: Clarify objective: Eliminate legacy Superpowers discovery paths across AIOS-managed clients — _Objective restated; constraints listed_
- [ ] **t2-plan**: Break work into executable tasks — _Plan tasks updated beyond scaffold if needed_
- [ ] **t3-implement**: Implement changes — _Code changes match objective_
- [ ] **t4-verify**: Verify with tests/checks — _Evidence recorded (command or artifact path)_

## Progress

- status: active

## Decision Log

- Test scope contract:
  - User goal: after AIOS setup, update, or fresh projection, a new client
    session discovers Rex-only workflow guidance and cannot automatically enter
    the historical Superpowers spec-and-separate-commit flow.
  - In scope: retire exact historical Superpowers symlinks, remove the exact
    historical Codex Superpowers checkout from its discovery root by moving it
    into an AIOS recovery location, refresh the legacy shared router when its
    content matches the historical AIOS Superpowers router, and project Rex
    workflow skills to Codex, Claude, Gemini, OpenCode, Hermes, and Grok.
  - Out of scope: rewriting or deleting project history, existing
    `docs/superpowers/specs` documents, arbitrary user skills, a foreign link
    target, or a non-symlink user directory.
  - Observable acceptance: after the lifecycle entrypoint completes, no
    recognized Superpowers path remains in a client discovery root; the old
    source is recoverable outside discovery roots; all six client roots contain
    `rex-workflow`; and the installed router does not contain `superpowers:`.
  - Public test seam: the lifecycle reconciliation entrypoint with isolated
    home directories. Unit seams cover source retirement and router migration;
    the lifecycle test verifies setup/update forward the convergence behavior;
    the existing all-client Rex projection test verifies the six client roots.
  - Prohibited test shortcuts: do not weaken existing user-owned conflict
    protections, skip legacy inputs, assert internal call counts instead of
    filesystem state, or treat a mocked removal as proof of the public result.

## Acceptance

- Complete planned tasks and record verification evidence.

## Next Actions

- Start with the first pending task.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## Status

- status: active
