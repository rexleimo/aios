# GAIA A/B Production Execution Test Scope

## User Goal

Prepare a safe, operator-gated production entry point for a local GAIA A/B
evaluation using the pinned client/model pairs `codex/gpt-5.6-terra`,
`claude/claude-sonnet-5`, and `hermes/deepseek-v4-pro`. The entry point must
be ready to start only after the local client and browser prerequisites are
healthy and an operator explicitly elects to execute it.

## Explicit Non-Goals

- No model request, browser navigation, GAIA dataset download, leaderboard
  submission, credential change, or paid invocation during implementation or
  automated tests.
- No implicit live mode: ordinary invocations remain validation-only and a
  live request must require an explicit `--execute` control.
- No broad session history, handoff, persona, private prompt, raw error, or
  authorization material passed to a client or written to an artifact.
- No changing the existing task manifest digest, pairing, shared-budget, arm
  isolation, redaction, or score-reporting rules.

## Acceptance Mapping

| Behavior | Public assertion | Stable seam |
| --- | --- | --- |
| Safe default | Calling the production CLI without `--execute` performs validation only and launches no client process. | Spawn the public CLI with injected process and browser adapters. |
| Explicit live gate | `--execute` is rejected before a client launch when the manifest digest, browser preflight, client availability, task cap, spend cap, or timeout is invalid. | Public CLI validation path and injected preflight adapters. |
| Pinned clients | A valid execute request constructs exactly the approved three client/model command forms and passes only task-specific, redacted input. | Narrow command-builder adapters selected by `client` and `model`. |
| A/B fairness | Each client receives separate baseline and optimized jobs with identical task selection, shared limits, and all non-policy controls. | Existing `runGaiaLiveEvaluation` public runner result. |
| Audit boundary | Artifacts contain only the existing whitelist fields and no launch occurs after a global spend breach. | Existing public artifact collection and live-runner tests. |
| External smoke gate | A one-client, one-task-per-level operator smoke may be enabled only after all local preflights pass and requires a separately supplied exact manifest digest. | Production CLI `--execute` path; never the automated test suite. |

## Public Test Seams

- Add a public CLI module under `scripts/` which delegates evaluation policy to
  `runGaiaLiveEvaluation`; it must accept injected filesystem, process, and
  browser-preflight adapters for local tests.
- Keep each concrete client command builder in
  `scripts/lib/gaia-ab-eval/` behind a narrow `(task, job, limits) -> outcome`
  contract.
- Reuse `parseGaiaLiveManifest`, `runGaiaLiveEvaluation`, temporary task
  manifests, and the existing local fake adapters in
  `scripts/tests/gaia-ab-live-runner.test.mjs`.
- Add a focused CLI test file that asserts process launch intent and parsed
  outcomes without executing Codex, Claude, Hermes, a browser, or a network.

## Minimum Independently Failing Slice

The first RED scenario invokes the public production CLI with a syntactically
valid execute manifest and unavailable browser preflight. It must fail closed
before attempting any client command. This represents the safety boundary of
the new observable behavior while using only local fakes.

## Completion Criteria

Focused automated tests prove that normal mode makes no model call; execute
mode validates all limits and prerequisites before launching; each supported
client/model identity is pinned; task inputs exclude expected answers; and
returned/persisted artifacts remain whitelist-only. A distinct operator review
will be required before any paid smoke run.
