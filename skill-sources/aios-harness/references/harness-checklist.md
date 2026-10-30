# AIOS Harness Checklist

## Preflight

- Explicit task type is one-shot or recurring; objective and non-goals are clear.
- Reuse accepted requirements/spec/work item; record its ref and revision.
- Trigger/input, output artifacts, and task-appropriate completion evidence are defined.
- Time, iteration, and retry limits map to supported runtime controls; unsupported requirements are visible gaps.
- Human decision points identify the decision and material to prepare beforehand.
- Recurring definitions specify input identity/baseline and duplicate policy; each run gets its own evidence.

## Per-Step Contract

- Input state and the current Rex Command are identified.
- Action is bounded and idempotent where possible.
- Success is backed by the required command/artifact/human evidence.
- Failure signal, changed-hypothesis retry, and stop path are defined.

## Recovery and Human Decisions

- Persist run state and next action at recovery checkpoints.
- Human decision points contain a question, evidence, options, and recommendation.
- Neither a saved checkpoint nor an unanswered brief counts as approval.
- Retry only within the accepted budget and with a changed hypothesis.
- Resume only the selected run after explicit user/orchestrator intent.

## End-of-Run

- Verify this run's acceptance and output artifacts with fresh evidence.
- Record result, remaining gaps, and recovery/knowledge refs.
- Return source-backed environment-improvement candidates when warranted.
- Skill/runbook changes follow their own authorized review/application flow.
