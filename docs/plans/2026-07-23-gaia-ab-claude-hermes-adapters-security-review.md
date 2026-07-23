# GAIA A/B Claude Adapter Security Review

## Specialist Scope

Reviewer: `security`.

Scope is limited to the local command-construction data boundary in
`client-adapters.mjs`: task fields, policy text, model selection, and generated
argv/input. There is no process launch, credential lookup, network request, or
artifact persistence in this slice.

## Evidence

- The factory hard-codes the only accepted Claude model as
  `claude-sonnet-5` and builds a fixed argv array; no task or policy field
  becomes a command-line option.
- `buildTaskInput` reads only `taskId`, `level`, and `prompt`; it does not
  destructure, interpolate, or return `task.expected`.
- The focused test passes a sentinel expected answer and asserts that it is
  absent from generated input. Receipt:
  `receipt:575aedef-22e7-48d8-8d44-509b4d58a17c`.
- The Claude argv intentionally contains no `--safe-mode` or `--ignore-rules`,
  so the common project instructions are not bypassed.

## Verdict

No security finding within this bounded, pure-construction slice. The remaining
risk is deferred, not accepted: a later process-launch implementation must
redact raw client output/errors and constrain usage-file/artifact paths before
it can invoke a model. Severity: none for the current slice; required action:
retain this expected-answer sentinel test when adding launch behavior.
