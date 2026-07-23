# Rex Projection Semantic Parity Test Scope

## User Goal

Every supported public projection of a Rex blocked workflow result retains the
Rex-owned outcome semantics. A caller can determine why progress stopped from
the standalone JS API, the compact CLI response, or the AIOS adapter response.

## Explicit Non-Goals

- Do not change capability or Provider selection.
- Do not change evidence validation, retry behavior, dependency scheduling, or
  persistent workflow data.
- Do not add a scheduler, reinterpret an outcome in AIOS, or compare the AIOS
  executable Provider binding as though it were Rex-owned workflow semantics.
- Do not remove existing compact CLI keys or make private state the assertion
  target.

## In-Scope Observable Behavior

| Acceptance behavior | Public assertion | Test seam |
| --- | --- | --- |
| Direct standalone result retains a blocked reason | A rejected evidence advance returns `outcome: 'blocked'` and `blockedReason: 'evidence-invalid'`, with unchanged workflow/command identity and missing evidence. | `advanceSoftwareWorkflow()` application test. |
| Compact CLI retains core blocked semantics | `presentCliWorkflow()` of that blocked result contains the original compact keys plus the concrete `blockedReason`; it retains status, workflow activation ID, work item key, command identity, and missing evidence. | `rex-harness/src/cli/workflow-output.mjs` public projection test. |
| AIOS adapter does not lose or reinterpret Rex semantics | A blocked adapter advance equals a direct Rex advance for outcome, blocked reason, workflow status/activation, command identity, and missing evidence. Provider binding is compared separately as the one allowed host transformation. | `scripts/tests/rex-harness-adapter.test.mjs`. |
| Compatible compact results remain usable | Existing tests still accept the compact envelope and a non-blocked result need not invent a blocked reason. | Existing CLI and workflow suites. |

## Out of Scope Behavior

- The internal shape of an evidence validator or CLI formatting implementation.
- Error-message wording where the typed `blockedReason` is already the public
  contract.
- Long-running delivery feature dependency transitions; their typed results are
  covered by their dedicated public contract tests.

## Smallest Independent Vertical Slice

Use a rejected evidence submission against an existing public software
workflow fixture. It is the smallest genuine behavior delta because the core
API already produces `blockedReason: 'evidence-invalid'`, while the compact
CLI currently demonstrably omits it. The same deterministic blocked transition
can feed the AIOS adapter comparison without mocking a scheduler or testing
only a hand-built projection object.

## Completion Criteria

The focused public tests distinguish a lost `blockedReason` from a preserved
one, all listed Rex-owned fields agree at the three surfaces, and existing
compact CLI compatibility tests remain green. Tests must fail before the
additive CLI-projection fix and pass after it; they may not pass by deleting
assertions, weakening expectations, or inspecting private workflow state.
