# GAIA A/B Claude and Hermes Adapter Test Scope

## User Goal

Add the two remaining pinned client invocations to the pure GAIA adapter:
Claude Code with `claude-sonnet-5` and Hermes with `deepseek-v4-pro`.

## Non-Goals

- No process spawn, model, browser, network, dataset, leaderboard, credential,
  or paid request.
- No `--safe-mode`, `--ignore-rules`, or equivalent option that would bypass
  the shared project workflow and normal client rule loading.
- No expected answer in arguments, stdin, usage path, or returned invocation.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Claude identity | A Claude invocation pins `claude-sonnet-5`, print mode, JSON output, and the task budget. | `buildGaiaClientInvocation`. |
| Hermes identity | A Hermes invocation pins `deepseek-v4-pro`, one-shot mode, and its supplied local usage path. | `buildGaiaClientInvocation`. |
| Common privacy | Both generated task envelopes include task/policy/limits but omit the sentinel expected answer. | Invocation `args` and `input`. |
| Misconfiguration | Model drift is rejected before any invocation object is returned. | Same exported function. |

## Minimum Independently Failing Slice

The existing public adapter test calls the factory for a pinned Claude task and
expects its noninteractive JSON command. The current factory rejects Claude as
unconfigured, yielding an honest local RED.

## Completion Criteria

Focused Node tests cover Claude and Hermes command construction, pinning,
expected-answer exclusion, and no-rule-bypass options. A later work item must
still implement process launch, usage parsing, browser preflight, and the live
CLI.
