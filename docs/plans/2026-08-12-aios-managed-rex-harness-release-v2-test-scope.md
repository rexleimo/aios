# Managed Rex Harness Release v2 Test Scope

## Goal

Release a SemVer minor AIOS update that provides `aios rex ...` as stable
managed Rex CLI entrypoint. Setup and update must retain compatible bundled
Rex availability, and local OpenCode/Hermes runtime settings must remain
untracked.

## Non-goals

- No global `npm link` or `PATH` mutation.
- No automatic upgrade to a Rex version outside AIOS compatibility contract.
- No deletion or modification of project `.rex-harness/` evidence journals.
- No inclusion of `opencode.json` or `.hermes/.aios-native-sync.json` in release commit.

## Acceptance mapping

| Requirement | Public test seam | Assertion |
| --- | --- | --- |
| Stable command | `aios rex doctor` | Forwards arguments to bundled executable and returns child exit code. |
| Runtime readiness | Rex runtime inspection | Requires executable entrypoint and reports bundled version. |
| Lifecycle continuity | setup/update runtime preparation | Ensures bundled Rex before client skill projection. |
| Local state | Git ignore and index state | Both requested paths ignored and untracked while preserved on disk. |
| Release | `VERSION`, `CHANGELOG.md` | Minor version and release entry describe managed Rex behavior. |

## First remaining slice

Add an integration test proving `aios rex doctor` runs via the public command
router. Existing runner unit test is retained as isolated process-boundary
coverage. The new CLI test must fail before dispatch parsing supports the
passthrough command.

## Completion criteria

Focused public command and runtime tests pass. Full regression, Rex tests and
doctor, plus MCP server typecheck/tests/build pass. Working-tree review uses
`git diff` rather than a commit-only range. Release commit excludes requested
local settings, is tagged at next minor version, and is pushed only after all
verification succeeds.
