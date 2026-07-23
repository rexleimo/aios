# GAIA A/B Claude and Hermes Adapters Implementation

## Implemented GREEN Slice

The shared invocation factory now supports Claude Code only when the model is
exactly `claude-sonnet-5`. It returns `--print`, JSON output, and
`--max-budget-usd` from the granted task budget without `--safe-mode` or
`--ignore-rules`. Its task input reuses the expected-answer-free common
envelope.

## Scope Boundary

Hermes remains unimplemented in this Green slice and requires its own RED.
Neither Claude nor Codex is executed; this change is pure command construction.
