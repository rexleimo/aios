# Software Workflow Typed Blocking Test Scope

## Goal

Make public software-workflow evidence validation failures observable as a
stable result, rather than requiring callers to parse thrown error messages.

## Public Acceptance Mapping

| Scenario | Public seam | Observable assertion |
| --- | --- | --- |
| Claimed RED has no receipt | `advanceSoftwareWorkflow()` | Returns `outcome: 'blocked'`, `blockedReason: 'evidence-invalid'`, same workflow ID, activation, command token, and missing evidence identity. |
| Receipt has a different scenario command | `advanceSoftwareWorkflow()` | Returns the same typed blocked result and leaves current command unchanged. |
| Valid evidence | Existing public runtime scenarios | Keeps existing transition outcomes and rotates command only after accepted evidence. |

## Non-Goals

Do not alter standalone persistence/CLI formatting, AIOS provider rebinding,
capability selection, or the meaning of valid evidence.

## Test Seam

Extend `tests/application/software-workflow-runtime.test.mjs` with the public
workflow initializer and advancement API. The focused test uses its existing
real receipt resolver fixtures and observes the returned public result plus
workflow identity only.

## Completion

Both invalid evidence scenarios are typed, fail closed without replacing the
current command, and existing valid workflow advancement still passes.
