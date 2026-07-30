# Context Lifecycle Agent Intelligence Review Remediation - Test Scope

## Goal

Close the independently reproduced gaps in the agent-intelligence completion without changing its stated non-security confirmation boundary.

## Acceptance mapping

1. With no explicit task ID, orchestration selects the first dependency-topological pending task that has persisted context requirements; if none has context, it retains the established first-pending fallback. Explicit task IDs still win.
2. `aios_plan_task` returns confirmation as structured executable/argument data and never interpolates a task ID into a shell command string.
3. A default candidate limit reserves available codemap relation candidates (`tests_for`, `callers_of`, `callees_of`, `imports_from`) rather than allowing direct targets to exhaust all slots.
4. Candidate confirmation is serialized per task. An interrupted confirmation whose active task already carries the proposal confirmation marker recovers to `confirmed` without reapplying or losing the proposal.
5. The human confirmation language remains an explicit process step and never claims authentication or identity proof.

## Public seams

- `prepareOrchestrateContextLifecycle()` and `aios_orchestrate` MCP.
- `aios_plan_task` JSON-RPC response.
- `proposeTaskContextCandidates()` and `confirmTaskContextCandidates()`.
- Temporary `node:sqlite` codemap fixtures and active plan sidecars.

## Focused test command

```text
node --test --test-concurrency=1 scripts/tests/planning-context-candidates.test.mjs scripts/tests/context-lifecycle-mcp-integration.test.mjs scripts/tests/context-lifecycle-orchestrate-integration.test.mjs
```
