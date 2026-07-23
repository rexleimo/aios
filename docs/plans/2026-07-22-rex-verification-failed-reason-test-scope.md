# Verification-Failed Reason Test Scope

## Public Mapping

| Scenario | Assertion |
| --- | --- |
| First nonzero receipt inside retry budget | Exact existing retry decision stays `{ kind: 'retry', currentFeatureId }`. |
| Next nonzero receipt beyond retry budget | Exact terminal decision is `{ kind: 'human-gate', reason: 'verification-failed' }`. |
| Pending next feature | Remains pending after the terminal gate. |

## Seam

Use the existing `startControlledDelivery()` fixture and public
`advanceLongRunningDelivery()` calls in
`tests/workflows/long-running-delivery.test.mjs`. It runs real controlled
nonzero receipts; no retry helper or internal status is mocked.

## Non-Goals

No change to retry count, max-retries configuration, CLI/JS/AIOS projection,
or other human-gate causes.
