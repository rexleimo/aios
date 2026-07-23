# GAIA Live A/B Client Error and Reconciliation Minimal Construction

## Reuse Ladder

1. **Remove accidental complexity:** no new runtime feature is required. The
   runner already has a terminal `client_error` path and reservation/release
   sequence; the gap is public verification.
2. **Reuse repository code:** reuse `runGaiaLiveEvaluation`, the existing
   `withTaskManifest` temporary-file helper, fake adapter injection, artifact
   collection, and `summarizeGaiaScores` assertions in
   `scripts/tests/gaia-ab-live-runner.test.mjs`.
3. **Use language/platform capability:** `node:test`, `assert`, and local
   `Error` values are sufficient to model a rejected client and numeric spend.
4. **Use installed dependencies:** none are needed; adding a mock or financial
   library would increase coupling without improving the behavioral boundary.
5. **Local expression:** two direct public tests can select the first job with
   small estimator/client branches and inspect the next job's visible budget.
6. **New construct:** none. No production module, CLI adapter, shared fixture,
   or abstraction should be added for this verification-only work.

## Minimal Option

Add two behavior-focused test cases to
`scripts/tests/gaia-ab-live-runner.test.mjs`:

- a rejected first client call must create `client_error`, retain its 2 USD
  reservation, skip that job's second task, and let the next job see 8 USD;
- a successful first task with a 2 USD estimate and 0.5 USD actual spend must
  let the next task see 9.5 USD.

This uses the established public seam and makes no real external request.
