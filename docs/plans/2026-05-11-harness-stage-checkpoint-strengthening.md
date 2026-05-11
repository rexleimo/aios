# Harness Stage Checkpoint Strengthening Plan

## Goal
Make the existing solo harness record explicit stage and evidence information for each loop iteration, and persist that information into ContextDB checkpoints when a ContextDB session exists.

## Scope
- Add a small stage taxonomy to solo harness iteration outcomes: `research`, `requirements`, `planning`, `development`, `validation`, `handoff`.
- Add `evidence` strings to each iteration outcome.
- Surface latest stage/evidence in solo run status.
- Persist one ContextDB checkpoint per solo iteration when the session metadata exists.
- Keep compatibility with existing harness callers by defaulting missing stage to `development` and deriving evidence from touched files/next action.

## Non-goals
- No new generic Policy Engine.
- No container sandbox.
- No broad Hooks framework beyond existing lifecycle hooks.
- No new agent team orchestration model.

## File Plan
- Modify `scripts/lib/harness/solo-runtime.mjs` for stage/evidence normalization, prompt contract, and checkpoint persistence.
- Modify `scripts/lib/harness/solo-journal.mjs` for journal/status schema fields.
- Modify `scripts/lib/lifecycle/harness.mjs` for status text and provider JSON prompt fields.
- Modify `scripts/tests/harness-runtime.test.mjs` and `scripts/tests/harness-journal.test.mjs` using TDD.

## Verification
- Run targeted tests first:
  - `node --test scripts/tests/harness-runtime.test.mjs scripts/tests/harness-journal.test.mjs`
- Run harness-related script suite if targeted tests pass:
  - `npm run test:scripts`

## Implementation Steps
1. Write failing tests for normalized stage/evidence and status surfacing.
2. Write failing test for per-iteration ContextDB checkpoint persistence with an injected checkpoint writer.
3. Add minimal normalization and journal persistence.
4. Add checkpoint writer that skips safely when session metadata is absent.
5. Update production prompt/status display.
6. Run verification and document any residual warnings.
