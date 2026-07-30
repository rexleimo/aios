# Context Lifecycle Agent Intelligence Review Remediation - Minimal Construction

## Reuse ladder

1. Removing the behavior is rejected: the review reproduced a real MCP/default-orchestration miss and a copy-paste command injection risk.
2. Reuse existing mechanisms: retain `topologicalTasks()`, `updatePlanTask()`, atomic JSON writes, normalized task fields, and the local codemap reader.
3. No dependency is added: use Node built-ins and local planning state only.
4. The smallest complete option is:
   - rank pending tasks with persisted context requirements before empty pending tasks when no explicit task ID is supplied;
   - return structured confirmation argv rather than interpolated shell text;
   - reserve one candidate per available codemap relation before filling the remaining limit with direct targets;
   - serialize per-task confirmation with a planning-sidecar lock and use a durable `confirming` state plus a task confirmation marker to recover an interrupted two-file write.

## Non-goals

- No identity/authentication claim, remote authority, or live dispatch.
- No change to explicit `--context-task` semantics.
- No unrelated Dream production behavior change; the separately user-approved test stabilization only fixes the fixture timestamp tie.
