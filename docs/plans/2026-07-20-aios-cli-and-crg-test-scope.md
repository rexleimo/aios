# AIOS CLI Entry and CRG MCP Test Scope

## User goal

Every supported client environment must be able to resolve the installed
`aios` command reliably. CRG means the `code-review-graph` MCP server and must
be installed, configured, and diagnosed for every supported client.

## In scope

1. A shell installation creates a managed `aios` launcher in the existing
   native shim directory. From an unrelated working directory, the launcher
   executes the installed runtime root and forwards arguments unchanged.
2. Codemap configuration targets all clients in the client registry, including
   Hermes. Hermes receives `mcp_servers.code-review-graph` in
   `~/.hermes/config.yaml`, with `uvx code-review-graph serve` and the project
   working directory.
3. Codemap doctor reports the missing Hermes projection and `--fix` repairs it
   without removing unrelated user MCP configuration. The public codemap help
   lists the complete client set.

## Out of scope

- Running paid or live client smoke tests, or creating smoke/provenance records.
- Changing browser MCP aliases or treating CRG as a browser MCP server.
- Overwriting unmanaged `aios` launchers or unrelated user MCP entries.
- Releasing, tagging, or publishing this work item.

## Acceptance mapping

| Observable behavior | Public assertion | Test seam |
| --- | --- | --- |
| `aios` is available after shell setup | Invoke the generated launcher from a different CWD and assert the installed root and arguments reach the fixture runtime | `installContextDbShell` -> `$HOME/.aios/bin/aios` |
| All clients receive CRG | Collect targets for `all` and assert six registry-aligned targets, including Hermes YAML | `collectCodemapMcpTargets` |
| Hermes CRG is safe and repairable | Run codemap doctor before and after `--fix`; preserve an unrelated YAML MCP entry | `doctorCodemap` / `installCodemap` |
| User-facing terminology is unambiguous | Help text names `code-review-graph` and the six supported clients | `getCodemapHelpText` |

## Design boundary

The existing shell component owns launcher lifecycle and collision handling.
The codemap MCP-target layer owns client-specific configuration formats. A
shared Hermes YAML MCP adapter belongs with MCP configuration format handling,
not in shell code or client registry code. Tests remain in the existing
component-level suites.

## Baseline and completion criteria

Baseline command: `node --test scripts/tests/aios-components.test.mjs
scripts/tests/codemap.test.mjs` passed 42 tests before the new assertions.

Completion requires the new public assertions to fail before implementation,
pass after implementation, preserve user-owned config, and keep the focused
suite green. No skipped assertions, relaxed expectations, or fixture-only
claims may substitute for those behaviors.
