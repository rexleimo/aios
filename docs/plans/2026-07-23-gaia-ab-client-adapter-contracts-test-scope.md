# GAIA A/B Client Adapter Contracts Test Scope

## User Goal

Turn the already pinned GAIA live-runner inputs into narrow, locally testable
client-command contracts for Codex `gpt-5.6-terra`, Claude Code
`claude-sonnet-5`, and Hermes `deepseek-v4-pro`. A future public `--execute`
path must reject unmet local prerequisites before it can spawn any of those
clients.

## Explicit Non-Goals

- No model request, browser launch, network access, GAIA download, leaderboard
  submission, credential mutation, or paid usage.
- No reading or transmitting task expected answers to a client process.
- No disabling the common project instructions, project workflow, or normal
  client rule loading to obtain a shorter prompt.
- No live CLI activation until a digest-pinned task manifest, browser/CDP
  preflight, and operator limits are supplied and pass locally.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Identity pinning | Command construction rejects any client/model pair other than the three declared pairs. | Exported client-adapter factory. |
| Safe task envelope | Every command receives task id, level, prompt, arm policy, timeout, and granted budget but never `expected`. | Exported task-prompt builder and captured process arguments/stdin. |
| Client isolation | Codex, Claude, and Hermes receive their own documented noninteractive command forms and output/usage paths. | Injected `spawnProcess` adapter; no real executable is run. |
| Execute preflight | The public execute entry validates live manifest and browser readiness before asking the factory to start a client. | Public CLI module with injected preflight/process adapters. |
| Fail-closed dependency state | A missing executable, unhealthy browser, invalid digest, cap, budget, or timeout returns an error with zero client launches. | Existing live runner plus launch spy. |
| Artifact boundary | Process payloads and local errors are parsed into the existing whitelist-only artifact contract, never persisted raw. | Existing live-artifact creation and fake process outcomes. |

## Public Test Seams

- Add one `scripts/lib/gaia-ab-eval/` adapter module with narrow exported
  command-building and launch functions; its process runner is an explicit
  injected dependency in tests.
- Reuse `runGaiaLiveEvaluation`, `parseGaiaLiveManifest`, and the existing
  fake browser, task-manifest reader, and artifact writer seams.
- Add a focused Node test that captures commands and stdin locally. It must not
  call `codex`, `claude`, `hermes`, MCP, or a browser executable.

## Minimum Independently Failing Slice

An exported adapter factory is asked to prepare a Codex task command with its
pinned model and a task containing both prompt and expected answer. The public
assertion expects a noninteractive Codex command and a task payload without the
expected answer. Before implementation, the module does not exist and the
focused test fails for that absent public adapter behavior.

## Completion Criteria

Focused tests prove the three exact client/model identities, per-client
noninteractive command construction, expected-answer exclusion, per-task
budget/timeout propagation, and no-process behavior when preflight fails. A
separate operator review remains required before any first paid smoke run.
