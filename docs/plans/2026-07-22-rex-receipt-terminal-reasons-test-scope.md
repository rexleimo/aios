# Receipt and Terminal Reasons Test Scope

## Public Contract

| Scenario | Public result |
| --- | --- |
| Receipt cannot resolve or fails validation | `{ kind: 'blocked', reason: 'evidence-rejected' }`, with active feature unchanged. |
| Receipt command differs from the active feature scenario | `{ kind: 'blocked', reason: 'evidence-rejected' }`, with active feature unchanged. |
| Nonzero receipt within retry budget | Existing `{ kind: 'retry', currentFeatureId }` behavior remains unchanged. |
| Nonzero receipt after retry budget | Existing `human-gate` result adds `reason: 'verification-failed'`. |

## Seam

Extend the existing public `advanceLongRunningDelivery()` tests in
`tests/workflows/long-running-delivery.test.mjs`, using its real standalone
receipt capture/resolution fixtures. Assertions must cover returned decision
and ledger state, not caught validator errors.

## Non-Goals

No CLI/JS/AIOS projection work, no retry-policy redesign, and no persistence
or recovery changes.
