# v5 Release CI Test Scope Contract

## User goal

The v5 release workflow must run its root release tests from a clean GitHub
checkout without requiring an operator-owned, untracked root `.mcp.json`.

## Non-goals

- Do not read, change, or commit a user's real `.mcp.json`.
- Do not change interception runtime behavior, MCP migration policy, or the
  already-published `v5.0.0` tag.
- Do not broaden this repair into client configuration cleanup.

## In-scope behavior and test seam

The existing public CLI scenario in
`scripts/tests/interception-cli.test.mjs` may create its own valid `.mcp.json`
inside its temporary `--workspace`. That fixture is the sole allowed test seam.
It must be sufficient for `interception doctor --fix` to perform MCP migration,
and the test must continue to assert that the resulting temporary config uses
`aios-mcp-proxy.mjs`.

The repository-root `.mcp.json` is outside the scenario. A clean checkout may
omit it entirely.

## Acceptance mapping

| Acceptance behavior | Observable assertion | Command |
| --- | --- | --- |
| The fixture is self-contained | A temporary workspace contains a synthetic MCP JSON input before the CLI runs. | `node --test scripts/tests/interception-cli.test.mjs` |
| Migration still works | `interception doctor --fix --workspace <temp> --json` exits successfully and reports an MCP proxy target. | Same focused test |
| The migrated config is proxied | The temporary `.mcp.json` matches `aios-mcp-proxy.mjs`. | Same focused test |
| A clean checkout does not depend on local state | The focused test passes in a detached clean checkout with no root `.mcp.json`. | Clean-worktree focused test |

## Completion criterion

The pre-fix clean-worktree failure is caused by the missing root configuration.
After the minimal fixture-only change, the focused test passes both locally and
in a clean checkout without accessing any operator configuration.
