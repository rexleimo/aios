# Native Sync Shared-AGENTS RED Observation

## Public Scenario

- Entry: `syncNativeEnhancements()` through the temporary-root integration
  cases in `scripts/tests/native-sync.test.mjs`.
- Preconditions: the fixture writes a shared core plus legacy client and
  route-specific partials, then synchronizes individual and all-client target
  roots.
- Expected behavior: `AGENTS.md` contains only `Shared native instructions.`;
  Claude and Gemini overlays are written to their own instruction files.

## Execution

```text
node --test scripts/tests/native-sync.test.mjs
```

Receipt: `receipt:e91c6a42-aedb-4213-95c8-1fab2ab2de28`

The public scenario exited with status `1`.

## Failure Classification

The failure is a valid RED for the approved shared-AGENTS contract. Six
integration assertions still expect the retired shared-block contents:
`AGENT-ROUTING-CAP`, `CODEMAP-NATIVE`, `Codex native block`, or `Opencode
compatibility`. The current composer instead returns the fixture's compact
shared core for every `AGENTS.md` client. This is neither a syntax failure nor
an unavailable dependency; it is the observable mismatch that the test repair
must correct.
