# GAIA A/B Client Adapter Contracts Implementation

## Implemented GREEN Slice

Added `buildGaiaClientInvocation` as a pure Codex command constructor. It
accepts only `codex/gpt-5.6-terra`, builds the documented noninteractive
read-only `codex exec` argv, and returns task text through stdin.

The input builder copies only task id, level, prompt, arm policy, timeout, and
granted budget. It deliberately destructures no expected-answer field, does not
inspect the usage path, and starts no process.

## Scope Boundary

This is the first independently tested adapter slice. It does not yet expose a
process runner, parse a model response, attach a live CLI, or configure Claude,
Hermes, browser/CDP, GAIA data, credentials, or a paid invocation.
