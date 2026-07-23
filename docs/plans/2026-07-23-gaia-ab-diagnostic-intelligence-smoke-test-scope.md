# Workflow Intelligence Diagnostic A/B Test Scope

## Purpose

Answer the operator's immediate question: whether the workflow-guidance change
introduced by `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9` improves configured
agent outcomes in a small, reproducible, no-browser diagnostic run.

This is deliberately separate from GAIA. The GAIA validation split is not
available locally under an authorized dataset grant, so a diagnostic result
must never be labeled, submitted, or compared as a GAIA score.

## Policy Sources

The two arms are exact, reproducible source snapshots:

| Arm | Guidance source | Source ref |
| --- | --- | --- |
| `baseline` | Guidance immediately before the shared-workflow optimization | `c3b9197853bfb93ec264b03a838162cca9a035c4:AGENTS.md` |
| `optimized` | Guidance introduced by the shared-workflow optimization | `4a77ad3d0eb0c5e2043bd9aaea91e3107d6210e9:AGENTS.md` |

At run creation, the runner must resolve both references and record a
SHA-256 digest for each rendered policy. It must fail before launching a
client if either reference is unavailable or its digest differs from the
approved manifest. The client-visible envelope must differ only in the
rendered policy; `baseline` and `optimized` labels are reporting metadata and
must not be injected into the task prompt.

## In Scope

- A local, non-GAIA manifest of independently scoreable, no-browser reasoning
  and repository-navigation tasks. Repository tasks use a digest-pinned
  fixture directory outside this repository, with no `AGENTS.md`,
  `CLAUDE.md`, `GEMINI.md`, or client-specific instruction file. Each task
  records an ID, category, prompt, answer-normalization rule, and expected
  answer; the expected answer stays outside every client-visible input.
- Codex `gpt-5.6-terra`, Claude `claude-sonnet-5`, and Hermes
  `deepseek-v4-pro`, reported as three independent client/model result sets.
- Identical task order, task digest, model, timeout, retry policy, concurrency,
  isolated fixture-directory digest, and no-browser/no-network-tool policy for
  the two arms of one client/model pair.
- Process timeouts, a positive task cap, a total spend cap, and client-specific
  cost evidence before any model is launched. A client whose actual cost cannot
  be observed must fail closed rather than emit an invented USD value.
- Exact-match or task-declared normalization scoring, paired per-task outcomes,
  and an `improved`, `not_improved`, or `inconclusive` result for each
  client/model pair.

## Explicit Non-Goals

- Downloading, reading, redistributing, scoring, or submitting the gated GAIA
  dataset; using a browser, MCP browser server, search tool, or leaderboard.
- Combining outcomes across clients or claiming that a workflow result measures
  an underlying model's inherent intelligence.
- Treating a small diagnostic sample as a statistically conclusive benchmark.
- Sending repository secrets, authorization state, standard answers, or raw
  client logs to another client or into a committed artifact.

## Acceptance Mapping

| Observable behavior | Public assertion | Test seam |
| --- | --- | --- |
| The intended policy contrast is real and reproducible. | A manifest resolves the two committed policy sources, records their distinct SHA-256 digests, and rejects a stale or unavailable source before a process launcher is called. | Public diagnostic-manifest loader and injected process launcher. |
| Both arms receive equivalent controls. | A configuration with a mismatched model, task digest, timeout, retry policy, concurrency, isolated fixture directory, or tool policy rejects before either arm starts. | Public configuration validator. |
| No answer is leaked. | A sentinel expected answer in a task manifest is absent from every client-visible stdin/argv payload. | Public invocation builder with inert launcher. |
| A no-browser diagnostic cannot gain unequal tools. | The runner rejects a browser/search/tool capability and passes an explicit no-browser policy to both arms. | Public runner preflight. |
| Costs and time cannot silently escape the run. | Missing positive caps, an unobservable actual cost, a launch timeout, or a reported spend breach terminates the affected work without launching later tasks. | Public runner with fake clients and clock/process adapters. |
| The conclusion is paired and client-isolated. | A result emits separate client/model reports with paired task outcomes; a sample below its declared evidence threshold is `inconclusive` rather than an improvement claim. | Public report builder with deterministic fixtures. |

## Smallest Vertical Slice and Ownership

The smallest independent slice is one local task executed twice for one pinned
client, with the two committed policies, a short explicit timeout, a fixed
spend reservation, and a report that says `inconclusive` unless the configured
evidence threshold is met. It proves the policy contrast, parity, answer
separation, and terminal safety without pretending that one task demonstrates
an intelligence increase.

The existing GAIA modules are intentionally not repurposed: their live runner
requires a common browser preflight and their name/artifacts would blur the
dataset boundary. A future `scripts/lib/workflow-diagnostic/` module owns this
diagnostic contract; its focused tests belong in `scripts/tests/`. The current
stage changes only this scope contract and does not authorize a model call.

## Completion Criterion for This Stage

The next workflow stage may implement the diagnostic only after this document
is accepted as the test-scope contract, acceptance mapping, and public-test
seam record. No client process is launched during test design.
