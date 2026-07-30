# Context Lifecycle Agent Intelligence Completion - Test Scope

## User goal

Complete the original goal of increasing agent capability in workflow orchestration. An agent must be able to propose useful execution context from task targets and the installed codemap without a human manually typing every context reference. A human must explicitly confirm the proposal before it mutates the active plan.

## Acceptance mapping

1. The public AIOS MCP server exposes `aios_plan_task` for an agent to propose context candidates for an existing structured-plan task.
2. Supplying targets through MCP creates a durable proposal but leaves `active.json` task targets and `contextRequirements` unchanged.
3. Candidate inference always includes usable workspace targets and, when `.code-review-graph/graph.db` is available, includes deterministic codemap callers, callees, and/or tests related to those targets.
4. A human CLI confirmation applies selected candidates and proposed targets to the active task; a stale proposal is rejected rather than silently applied.
5. After confirmation, real MCP orchestration preferentially selects a pending task with persisted context by default and delivers non-empty context without exposing source body text in the public report.
6. Installed codemap guidance tells agents to propose candidates through MCP and tells users that only the CLI confirmation step activates them.

## Non-goals

- No LLM planner, remote broker, external authority claim, or live dispatch.
- No automatic active-plan mutation from MCP inference.
- No mutation of unrelated dirty files or git history.

## Public test seams

- `handleMessage()` JSON-RPC tool calls for MCP behavior.
- `runPlanCommand()` for the human confirmation boundary.
- `prepareOrchestrateContextLifecycle()` / `aios_orchestrate` for runtime delivery.
- A temporary Node `node:sqlite` codemap fixture for deterministic graph relationships.

## Focused test command

```text
node --test --test-concurrency=1 scripts/tests/planning-context-candidates.test.mjs scripts/tests/context-lifecycle-mcp-integration.test.mjs scripts/tests/codemap.test.mjs
```
