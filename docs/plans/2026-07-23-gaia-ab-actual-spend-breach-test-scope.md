# GAIA Live A/B Actual-Spend Breach Test Scope

## User Goal

Prevent a non-conforming task adapter from turning a reported over-limit actual
spend into more launches. Once the reported spend exceeds the adapter's granted
budget, the entire evaluation must become terminal and locally auditable.

## Explicit Non-Goals

- No real model, browser, network, dataset, leaderboard, credential, or paid
  call.
- No attempt to undo or conceal a charge already reported by a client.
- No relaxation of ordinary cost-limit, timeout, client-error, or successful
  reconciliation behavior.
- No raw prompt, error, authorization, or adapter payload in persistence.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Global terminal stop | A first fake client result reports 11 USD after being granted a 10 USD boundary; no second task or other job is launched. | Public runner with a two-task manifest and launch spy. |
| Breach artifact | Exactly one whitelist-only `spend_limit_breach` artifact records the reported 11 USD and excludes prompt, error, and authorization. | Existing artifact writer collection. |
| Operator visibility | The returned result exposes a global terminal status and zero remaining budget without raw adapter error data. | Public runner return value. |
| No ordinary-score pollution | A terminal breach artifact is not a completed score record; successful-artifact scoring remains unchanged. | Existing scorer filtered by status. |

## Public Test Seams

- Reuse `runGaiaLiveEvaluation`, `withTaskManifest`, and injected local fake
  adapters in the existing test file.
- Use a temporary two-task manifest, a 0.1 USD estimate, a fake client that
  reports 11 USD, and a local artifact array.

## Minimum Independently Failing Slice

One public scenario with an over-limit actual result must return a global
terminal outcome after its first launch. Current behavior is expected to treat
it as a per-arm client error and continue, creating an honest RED.

## Completion Criteria

The focused test proves one launch, one redacted breach artifact, a visible
terminal result, zero remaining budget, and zero later launches. It performs no
external I/O.
