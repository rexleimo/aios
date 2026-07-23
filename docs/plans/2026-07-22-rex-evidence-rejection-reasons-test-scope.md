# Evidence Rejection Reasons Test Scope

## Public Cases

| Input | Public assertion | Reason |
| --- | --- | --- |
| Evidence targets another feature | Ledger remains active with same current feature. | `evidence-feature-mismatch` |
| Receipt reference cannot resolve or cannot normalize | Ledger remains active with same current feature. | `evidence-rejected` |
| Receipt command differs from verification scenario | Ledger remains active with same current feature. | `evidence-rejected` |
| Retry budget exhausted by a nonzero receipt | Existing human gate remains, with stable terminal reason. | `verification-failed` |

## Seam and Boundaries

Extend `tests/workflows/long-running-delivery.test.mjs`, which already
constructs real standalone receipts and exercises `advanceLongRunningDelivery`
via the public package entry point. Do not mock receipt validation or assert
private caught errors. Missing evidence remains covered by the preceding slice.

## Completion

Every listed public branch exposes its documented reason; all valid, retry,
and successful acceptance paths continue to pass unchanged.
