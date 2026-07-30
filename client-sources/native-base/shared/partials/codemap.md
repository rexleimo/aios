<!-- Chinese note: code-review-graph (codemap) MCP decision checkpoints. All registered MCP clients receive this so Gemini and OpenCode can use the structural graph. -->

## AIOS Code-Review-Graph (codemap) MCP

This project exposes a structural knowledge graph via the `code-review-graph` MCP. Use it at each decision point in your workflow.

- Before doing anything: `get_minimal_context(task="...")` for project context and suggested next steps.
- Before modifying code: `get_impact_radius(detail_level="minimal")` to check blast radius, and `query_graph(pattern="tests_for", target="...")` to confirm tests exist (write tests first if not).
- After modifying code: `detect_changes(detail_level="minimal")` to verify actual impact matches expectations.
- Before submitting: `get_affected_flows()` plus `get_suggested_questions()` as a final safety net.
- Finding code: `semantic_search_nodes` before grep. Always use `detail_level="minimal"` and follow each response's `next_tool_suggestions`.

## Planning context proposals

When an active structured-plan task has implementation targets, call AIOS MCP `aios_plan_task` with `action="propose_context"`, the task id, and workspace-relative targets when the task has none. The tool derives target, caller, callee, and test candidates from codemap, but it does not modify the active plan. Present the candidate refs to a human. An explicit human-controlled CLI confirmation with `aios plan task <id> --confirm-context-candidates` (optionally repeated `--candidate-ref <ref>`) activates selected refs for orchestration; it is a process boundary, not an identity/authentication boundary. Do not claim context will be delivered before that command succeeds.
