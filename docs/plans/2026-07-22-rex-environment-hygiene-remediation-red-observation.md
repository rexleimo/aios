# Environment Hygiene Token Diagnostic RED Observation

## Command

`node --test scripts/tests/token-discipline.test.mjs`

The testability decision's public-scenario receipt is
`receipt:aaac2878-1156-46dd-84eb-a1da187025d0`; it exits nonzero with the
current project's 17-versus-9 aggregate-count assertion. The focused test-file
receipt is `receipt:dc088feb-342c-421a-a286-25c5beb33549`.

## Result

Exit code: 1. Six tests passed and two scoped behavior tests failed.

1. `token discipline evaluates MCP budgets per client configuration surface`
   expected `enabledMcpServers` to be `9`; actual value was `17`.
2. `token discipline detects low-value MCP servers and plans opt-in cost settings`
   expected three low-value findings; actual value was four because a direct
   `mcp-browser-use` entry is still classified as
   `not-routed-through-aios-proxy`.

## Failure Classification

This is a valid RED, not an infrastructure failure: both failures occur through
the public token-discipline APIs under the test-scope configuration and exactly
match the missing target behavior. Existing single-surface budget coverage,
explicit local policy coverage, and compact native-guidance coverage remain
green.
