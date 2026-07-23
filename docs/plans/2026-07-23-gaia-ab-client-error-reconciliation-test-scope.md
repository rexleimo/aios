# GAIA Live A/B Client Error and Reconciliation Test Scope

## User Goal

Close the remaining local execution evidence gaps before any real A/B smoke:
prove a rejected task client is isolated and financially fail-closed, and prove
successful actual spend replaces its estimate in the shared budget.

## Explicit Non-Goals

- No runtime code change, production adapter, browser, model, network,
  dataset, leaderboard, credential, or paid request.
- No change to the current digest-first, cost-limit, timeout, or shared-control
  behavior.
- No persisted prompt, raw error, authorization, or arbitrary client payload.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Client-error isolation | A normal rejection after a 2 USD accepted estimate writes one redacted `client_error` artifact with 2 USD, skips the job's second task, and permits the other five jobs to complete. | Existing public runner with two-task fake adapters. |
| Client-error reservation | The first unaffected job receives 8 USD remaining after the rejected first job reserves 2 USD. | Collected `launchTask` input. |
| Successful reconciliation | A 2 USD estimate followed by a 0.5 USD actual result gives the next job 9.5 USD remaining. | Existing public runner with one-task fake adapters. |
| Score and redaction continuity | Completed records remain scorable; terminal records use exactly the approved persisted fields and exclude prompt, error, and authorization. | Existing scorer and artifact collection. |

## Public Test Seams

- Reuse `runGaiaLiveEvaluation`, `withTaskManifest`, local fake adapters, and
  `summarizeGaiaScores` in the existing live-runner test file.
- The client error is a local rejected `Error`; budget inputs and artifacts are
  inspected at the public adapter boundary.

## Testability Baseline

Both targeted behaviors are already implemented. The new tests should pass
without a product edit; a passing baseline is therefore behavior-preserving
hardening evidence, not a fabricated RED.

## Completion Criteria

Both local public scenarios pass and show the expected 8 USD reservation and
9.5 USD reconciliation boundaries. No new runtime file or external I/O is
introduced.
