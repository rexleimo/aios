# GAIA A/B Hermes Adapter Test Scope

## User Goal

Add the requested Hermes `deepseek-v4-pro` command contract without creating a
model call.

## Non-Goals

- No Hermes process, model, browser, network, or paid invocation.
- No safe-mode or ignore-rules option.
- No expected answer in generated argv or task text.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Pinning | The factory accepts only `hermes/deepseek-v4-pro`. | `buildGaiaClientInvocation`. |
| One-shot audit | The invocation uses `--oneshot` and passes the exact supplied local usage-file path. | Returned argv. |
| Privacy | The one-shot prompt contains the permitted task fields but not the sentinel expected answer. | Returned argv/input. |

## Minimum Slice

Ask the existing public factory for a Hermes invocation. It currently rejects
Hermes as unconfigured; the focused adapter test therefore supplies an honest
local RED.

## Completion Criteria

Focused tests prove pinning, one-shot/usage behavior, and answer withholding.
Process launch remains a separate later behavior.
