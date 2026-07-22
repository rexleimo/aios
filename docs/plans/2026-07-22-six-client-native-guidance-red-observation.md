# Six-Client Native Guidance RED Observation

## Scenario

Run the focused public native-guidance test suite after adding the approved
six-client projection contract.

```text
node --test scripts/tests/native-agent-guidance.test.mjs
```

## Expected Behavior

- Codex, OpenCode, Hermes, and Grok compose one byte-identical, client-neutral
  AGENTS projection.
- Every native entrypoint keeps the compact workflow invariants while detailed
  ContextDB, Browser MCP, Team/Harness, Model Router, and client manuals remain
  on demand.

## Observed Failure

The recorded command exited with status 1:

```text
receipt:1ca89c30-e8f4-45ae-8780-b83d04fede21
```

The focused test reports `4 !== 1` for the four AGENTS consumers. The current
composer appends a different client project source to each result, and the
Codex emitter additionally appends the OpenCode, Grok, and Hermes manuals.
The remaining focused failures show that the current always-loaded chain still
contains the route-specific partials and lacks the new compact route boundary.

## Failure Classification

This is a behavior failure, not a test or environment failure: the public
composer output differs from the approved shared-AGENTS contract before any
implementation change.

