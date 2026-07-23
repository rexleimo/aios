# GAIA Live A/B Arm Failure-Isolation Test Scope

## User Goal

Before an operator can run a real GAIA A/B smoke, retain independent results
when one client/model/arm encounters a budget, timeout, or client failure. A
failure must be observable locally without releasing the same job's next task
or stopping the other five isolated jobs.

## Explicit Non-Goals

- No real browser, model client, network request, GAIA download, leaderboard,
  paid call, credential, cookie, or production adapter in tests.
- No relaxation of digest-before-browser, client/model pinning, common A/B
  controls, explicit execute mode, deterministic task order, or global budget.
- No artifact field beyond task ID, level, expected, actual, client, model,
  arm, status, and spend.
- No retry of a failed task or later task in the same client/model/arm.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Cost-limit isolation | With two selected local tasks, an estimate above remaining spend causes zero launch for the first job, one redacted `cost_limit` artifact, no second task for that job, and completion of both tasks for every other job. | Public runner with fake estimator/client/writer. |
| Timeout isolation | A `TimeoutError` from the first task client call produces one redacted `timeout` artifact, no second task for that job, and completion of both tasks for every other job. | Public runner with fake client/writer. |
| Client-error isolation | A rejected first task client call produces one redacted `client_error` artifact, no second task for that job, and completion of both tasks for every other job. | Public runner with fake client/writer. |
| Redacted terminal record | Each failed artifact has exactly the approved persisted keys, a task-scoped ID, no prompt, authorization, or raw error, and an actual spend value. | Existing public artifact collection. |
| Shared spend guard | Every launch receives a finite non-negative remaining-spend boundary. A cost-limit task receives no launch; timeout/client failure reserves its estimate before later jobs run. | Fake estimator and collected client inputs. |
| Score continuity | All completed artifacts remain consumable by `summarizeGaiaScores`; terminal failures remain separately identifiable through status. | Existing public scorer. |

## Public Test Seams

- `runGaiaLiveEvaluation` is the sole public execution entry point.
- The existing temporary task-manifest helper is configured with `maxTasks: 2`.
- Tests inject only local manifest-reader, ready browser-preflight, estimator,
  client, and artifact-writer adapters.
- Tests assert the jobs' externally visible task inputs, result artifacts, and
  score-compatible completed records. They do not assert private helper calls.

## Minimum Independently Failing Slice

The first RED test triggers a cost estimate above the declared remaining budget
for the first job's first task. It is sufficient to prove that a local terminal
failure is recorded, that the job's second task does not launch, and that the
five unrelated jobs keep running.

## Completion Criteria

Each failure type has a focused public test and passes without external I/O.
Every failed job yields exactly one whitelist-only terminal artifact, launches
no later task, and does not prevent the other jobs from producing completed,
score-compatible local artifacts within the shared budget.
