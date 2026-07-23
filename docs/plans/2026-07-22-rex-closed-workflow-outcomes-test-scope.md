# Closed Rex Workflow Outcomes Test Scope

## Goal

Make public Rex transition results machine-readable and stable when evidence
cannot advance work, without altering valid success paths or host projections.

## Non-Goals

Do not change standalone CLI presentation, AIOS adapter binding, persistence,
or the full workflow storage schema in this slice.

## Public Acceptance Mapping

| Behavior | Public seam | Observable assertion |
| --- | --- | --- |
| Missing evidence | `advanceLongRunningDelivery()` | Returns `blocked` with a stable reason and preserves the active current feature. |
| Wrong feature | `advanceLongRunningDelivery()` | Returns `blocked` with a distinct stable reason and does not advance any feature. |
| Invalid or unresolved receipt | `advanceLongRunningDelivery()` | Returns `blocked` with a stable receipt-related reason and leaves ledger identity unchanged. |
| Nonzero receipt | `advanceLongRunningDelivery()` | Retains its existing retry/human-gate behavior and gives it a closed decision reason when terminal. |
| Workflow evidence validation | `advanceSoftwareWorkflow()` | Its expected public failures are typed outcomes/reasons rather than exception text alone. |

## Test Seam

Extend public contract tests for the long-running delivery entry point first,
then add a software-workflow runtime test only for an observable error envelope.
Tests assert result fields and ledger/workflow identity; they do not inspect
private validators or parser exceptions.

## Completion

Each evidence rejection class has a stable public reason, valid evidence still
advances exactly one feature/command, and existing success-path tests remain
green.
