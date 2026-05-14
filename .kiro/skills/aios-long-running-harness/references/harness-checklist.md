# Long-Running Harness Checklist

## Preflight
- Objective and non-goals are explicit.
- Absolute deadline and retry budget are set.
- Required permissions/login steps are identified.
- Artifact output path is defined.

## Per-Step Contract
- Input state is documented.
- Exact action is deterministic and idempotent.
- Success signal is machine-checkable.
- Failure signal and fallback path are defined.

## Recovery Rules
- Never apply two fixes at once.
- On each retry, change only one variable.
- After two failed retries in same class, escalate for human decision.
- Persist context before any manual handoff.

## End-of-Run
- Final evidence captured.
- Skills/runbooks patched if drift was discovered.
- Summary doc written with root cause and fix.
