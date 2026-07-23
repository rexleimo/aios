# Rex Projection Semantic Parity Execution Plan

## Scope and Boundary

Repair the semantic-loss point in the compact Rex CLI projection and prove
that the standalone JS API, compact CLI, and AIOS adapter preserve Rex-owned
blocked-result fields. The only permitted AIOS difference is binding the
executable Provider in `workflow.currentCommand.provider`.

This slice does not alter workflow selection, evidence validation, dependency
scheduling, or the compact envelope's existing keys.

## Dependency Graph

```text
blocked core result fixture
        |
        +--> CLI projection preserves blockedReason and existing keys
        |
        +--> JS API preserves the same core fields
        |
        +--> AIOS adapter preserves the same core fields
                         |
                         +--> focused compatibility verification
```

The three public projection checks have no runtime dependency on one another;
the implementation change is the only prerequisite for the CLI check. The
critical path is the CLI fix, then the focused public-surface verification.

## Steps and Evidence

| Step | Input and completion condition | Verification evidence | Recovery point |
| --- | --- | --- | --- |
| 1. Define public parity checks | A deterministic blocked core result; tests compare outcome, blockedReason, workflow status/identity, command identity, and missingEvidence at each public surface. Complete when tests distinguish omission from preservation. | Focused Rex CLI/API and root adapter test commands; the pre-fix CLI check must fail because `blockedReason` is absent. | Remove only the new test fixture if it cannot reproduce the diagnosed loss. |
| 2. Preserve the CLI field | `presentCliWorkflow()` adds the optional Rex-owned blocked reason without removing or renaming compact fields. Complete when a blocked result retains its reason and non-blocked output remains compatible. | Focused CLI projection test exits zero after the change. | Revert only the additive projection line; no workflow behavior changes are needed. |
| 3. Prove adapter and API parity | Direct Rex, compact CLI, and `advanceAiosSoftwareWorkflow()` are exercised with the same blocked transition. Complete when all Rex-owned fields agree, with provider binding explicitly excluded from the AIOS comparison. | Focused `rex-harness` and `scripts/tests/rex-harness-adapter.test.mjs` suites exit zero. | Keep the implementation and repair the assertions or fixture setup; do not add host-level outcome reinterpretation. |
| 4. Run compatibility checks | Existing workflow tests show legacy compact fields and no-edge progressions still work. Complete when focused suites and the relevant root script suite pass. | Recorded zero-exit receipts for focused suites and `npm run test:scripts`. | Stop before broad changes; investigate the first failing compatible behavior. |

## Execution Notes

- Apply the pre-edit safety gate before the source and test batch.
- Keep all checks at public seams; do not inspect or mutate private Rex state.
- A missing optional `blockedReason` in a result that does not represent a
  blocked state remains compatible. A blocked result must preserve its
  concrete reason.
