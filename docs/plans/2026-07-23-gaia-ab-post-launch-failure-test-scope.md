# GAIA Live A/B Post-Launch Failure Test Scope

## User Goal

Make the bounded GAIA A/B runner financially fail-closed after a task client
has begun work: preserve a validated estimate, record a useful redacted
terminal outcome, stop only the affected job, and continue independent jobs.

## Explicit Non-Goals

- No real browser, client, network, dataset, leaderboard, credential, or paid
  call in a test or default adapter path.
- No retry of a timed-out or rejected task and no second task for its job.
- No prompt, raw error, authorization field, or arbitrary adapter return value
  in a terminal artifact.
- No change to digest-first validation, cost-limit handling, selected models,
  common A/B controls, or explicit execute mode.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Timeout terminal state | The first job's first fake client call throws `TimeoutError`; exactly one redacted `timeout` artifact is written, and the job's second task does not launch. | Public runner with a two-task manifest and fake client/writer. |
| Client-error terminal state | The first job's first fake client call rejects normally; exactly one redacted `client_error` artifact is written, and the job's second task does not launch. | Public runner with fake client/writer. |
| Arm isolation | In either failure scenario, the other five jobs complete both selected tasks and produce score-compatible completed artifacts. | Collected client inputs and existing scorer. |
| Pre-launch reservation | A 2 USD estimate for the failed first task reduces the next job's available shared budget from 10 USD to 8 USD. | Fake estimator and client input collection. |
| Successful reconciliation | A successful result releases or consumes the difference between its estimate and actual spend without increasing the initial cap. | Fake estimator/client with collected remaining bounds. |
| Artifact redaction | Every terminal artifact has only the approved fields, the correct terminal status, a spend equal to its retained reservation, and no prompt, error, or authorization. | Existing artifact creator and temporary local collection. |

## Public Test Seams

- `runGaiaLiveEvaluation` remains the only public behavior entry point.
- Tests use the existing two-task temporary manifest with `maxTasks: 2`.
- The browser preflight, task reader, estimator, task client, and artifact
  writer are injected local fakes.
- Tests inspect client-visible budget inputs and local artifacts, rather than
  private state.

## Minimum Independently Failing Slice

The initial RED test throws `TimeoutError` on the first Codex baseline task
after an accepted 2 USD estimate. It is enough to expose the absent timeout
status and absent post-launch reservation while also proving job isolation.

## Completion Criteria

Focused timeout and client-error tests pass locally. Each produces one distinct
whitelist-only terminal artifact, preserves its estimate in the shared ledger,
stops its own job only, and leaves the other five jobs completed within the
original 10 USD bound.
