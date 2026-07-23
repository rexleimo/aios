# GAIA Live A/B Digest and Arm-Isolation Test Scope

## User Goal

Complete the local live-runner safety boundary before any real A/B operator
smoke: reject tampered task input before browser interaction, and retain useful
paired evidence when exactly one isolated client/model/arm fails.

## Explicit Non-Goals

- Do not invoke a real client, browser, network endpoint, GAIA dataset download,
  leaderboard, or paid service in automated tests or default execution.
- Do not change the selected client/model identities, shared A/B controls,
  task cap, global spend cap, or explicit `execute` requirement.
- Do not persist a prompt, credential, cookie, authorization value, raw error,
  or arbitrary adapter output in a successful or failed artifact.
- Do not continue another task in an arm after its first cost, timeout, or
  client failure.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Integrity-first rejection | A configured SHA-256 mismatch rejects with zero calls to both `browserPreflight` and `launchTask`. | Public runner, temporary task text, and spy adapters. |
| Cost-limit isolation | A cost estimate above remaining budget writes one redacted failure artifact and prevents only that job's launch; the other five jobs complete. | Injected estimator, client, and artifact writer. |
| Timeout isolation | A `TimeoutError` writes one redacted `timeout` artifact, stops that job, and lets all other jobs complete. | Injected client and artifact writer. |
| Client-error isolation | A rejected client call writes one redacted failure artifact, stops that job, and lets all other jobs complete. | Injected client and artifact writer. |
| Failure redaction | Every failed artifact contains only the approved scoring/audit fields and has no prompt, authorization, or raw error. | Existing artifact creator and temporary local collection. |
| Spend boundary | No task launch is made when its estimate exceeds the remaining global spend; completed jobs receive the then-current remaining boundary. | Injected estimator and client input collection. |

## Public Test Seams

- `runGaiaLiveEvaluation` remains the only public behavior entry point.
- Tests use the existing temporary local task manifest helper and injectable
  browser, manifest-reader, cost-estimator, client, and artifact-writer
  adapters.
- Assertions inspect adapter-visible input and local artifact records, not
  private helper calls or implementation classes.

## Minimum Independently Failing Slice

The first RED test uses a valid local task JSON but an intentionally incorrect
configured SHA-256. It proves that the runner rejects before the browser and
client boundaries, which is the smallest vertical slice for the integrity-first
gate.

## Completion Criteria

The public live-runner test covers all six acceptance rows using local fakes.
Each failure mode produces exactly one whitelist-only terminal artifact for its
job, while unaffected jobs remain score-compatible. The test suite remains
free of real model, browser, network, data-download, and leaderboard calls.
