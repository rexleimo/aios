# GAIA Live A/B Runner Test Scope

## User Goal

Run a controlled GAIA validation A/B evaluation for exactly these independent
client/model pairs:

- Codex: `gpt-5.6-terra`
- Claude Code: `claude-sonnet-5`
- Hermes: `deepseek-v4-pro`

Each pair must run a baseline and an optimized context-policy arm over the same
immutable local task manifest, use the same declared tool and browser profile,
and persist redacted local answer artifacts for the existing scorer/report
layer. The user has authorized local setup and the model-call resources needed
after the runner's preflight succeeds.

## Explicit Non-Goals

- Do not submit any result, task answer, or artifact to the GAIA leaderboard.
- Do not aggregate accuracy, statistical conclusions, or task outcomes across
  model pairs.
- Do not infer base-model intelligence from a single agent/tool evaluation.
- Do not embed credentials, cookies, prompts containing secrets, or raw
  authorization logs in a manifest, answer artifact, test fixture, or report.
- Do not start a model process when a required spend cap, task cap, timeout,
  task manifest hash, common tool/browser profile, or browser preflight is
  absent or inconsistent.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Explicit live gate | The runner refuses a normal invocation and starts processes only with `--execute`. | CLI with injected process adapter. |
| Bounded experiment | Missing/zero `maxTasks`, `maxSpendUsd`, or `timeoutSeconds` fails before any client process starts. | Pure live-manifest parser. |
| Fair arm controls | Baseline/optimized arms have identical task-manifest digest, tool profile, browser profile, timeout, retry, and concurrency. | Pure live-manifest parser. |
| Fixed client identity | Exactly Codex/gpt-5.6-terra, Claude/claude-sonnet-5, and Hermes/deepseek-v4-pro each have both arms. | Pure live-manifest parser. |
| Common browser readiness | A missing browser-use project or unusable declared CDP profile blocks every arm before the first spawn. | Public preflight result. |
| Isolated artifacts | One redacted local artifact is written per client/model/arm; no combined score is emitted. | Artifact writer with a temporary directory. |
| No hidden external action | `--dry-run` never spawns a client or contacts a model, browser, dataset source, or leaderboard. | CLI process adapter spy. |
| Failure is resumable | Per-task timeout or client failure writes a redacted failure record and stops the affected arm without silently changing task controls. | Fake client adapter in public runner test. |

## Public Test Seams

- `scripts/gaia-ab-live-runner.mjs` will be the public CLI. It accepts one
  local config file and distinguishes `--dry-run` from `--execute`.
- `scripts/lib/gaia-ab-eval/live-manifest.mjs` will parse immutable task and
  execution limits without reading credentials or contacting a service.
- `scripts/lib/gaia-ab-eval/live-runner.mjs` will accept narrow injected
  process, browser-preflight, clock, and artifact-writer adapters so tests can
  observe launches without invoking a real client.
- Tests in `scripts/tests/gaia-ab-live-runner.test.mjs` will use only temporary
  directories and in-memory adapters. A separately invoked operator smoke
  command is the only test allowed to use actual local CLIs or browser MCP.

## Minimum Vertical Slice

The first independently failing slice is a dry-run/execute gate for one local
three-client manifest. It is representative because it must enforce every
cost, identity, fairness, and browser prerequisite before a runner can launch
even one paid model task.

## Completion Criteria

Focused tests prove all acceptance rows above. A live invocation can begin only
when a user-supplied config explicitly pins a nonzero task cap, USD spend cap,
per-task timeout, immutable local task manifest digest, and a healthy common
browser/CDP profile. The first live invocation is a one-task-per-level smoke
for one client/model pair; expand to all client/model arms only after its local
artifact and scoring output are inspected.
