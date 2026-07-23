# Environment Hygiene Token Diagnostic Test Scope

## User Goal

Keep the configured primary browser MCP available while token diagnostics report
actionable, client-relevant budget evidence instead of asking the user to
disable required tooling merely to silence an aggregate warning.

## Explicit Non-Goals

- Do not clone, invent, or replace the missing external browser-use checkout.
- Do not change `maxEnabledServers`, disable configured MCP servers, or edit
  user-home client configuration.
- Do not remove ownership-ambiguous legacy Superpowers projections.
- Do not change route-command behavior: the native doctor repair dry run has
  no reproducible actionable issue on the current managed surface.

## Acceptance Mapping

| Observable behavior | Public test seam | Assertion |
| --- | --- | --- |
| Independent client configuration surfaces do not exhaust one shared MCP budget. | `inspectTokenDiscipline()` with a temporary root containing `.mcp.json`, `.gemini/settings.json`, and `.codex/config.toml`. | The reported enabled count is the largest active client surface, sources remain individually visible, and no budget warning is emitted when that count is within the configured limit. |
| One client surface over the configured budget remains visible. | Existing `runDoctorSuite()` token-discipline scenario. | The public doctor output retains the count and remediation warning for an actual single-surface over-budget case. |
| The configured primary `mcp-browser-use` server does not require the retired proxy wrapper. | `planTokenDiscipline()` with a direct primary browser spec and an unrelated direct browser-like server. | No `not-routed-through-aios-proxy` finding is produced for `mcp-browser-use`; the unrelated browser-like server remains flagged. |
| Explicit policy remains authoritative. | `planTokenDiscipline()` with `mcp-browser-use` in `lowValueServerNames`. | The primary server is still reported with `configured-low-value`, rather than being silently exempted from explicit local policy. |

## Test Boundary

The stable public seams are the exported `inspectTokenDiscipline()`,
`planTokenDiscipline()`, and aggregate `runDoctorSuite()` APIs. Tests use a
new temporary directory and real config files; they do not mock token findings
or read global client homes.

The smallest representative vertical slice is a three-surface temporary
configuration: it reproduces the aggregate-count false warning while keeping
the test independent of the user's personal MCP inventory.

## Completion Criteria

Focused token-discipline tests first fail against the current implementation,
then pass with the selected behavior. The full script suite remains green, and
the repository doctor no longer recommends disabling the configured primary
browser MCP solely because it lacks the retired proxy wrapper.
