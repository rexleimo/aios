<!-- Chinese note: code-review-graph (codemap) MCP decision checkpoints. All registered MCP clients receive this so Gemini and OpenCode can use the structural graph. -->

## AIOS Code-Review-Graph (codemap) MCP

This project exposes a structural knowledge graph via the `code-review-graph` MCP. Use it only when structural relationships materially affect the current decision; do not turn routine work into a graph-tool loop.

- Initial orientation: call `get_minimal_context(task="...")` at most once when repository structure is not already clear.
- Before a risky or multi-file change: use `get_impact_radius(detail_level="minimal")`; call `query_graph(pattern="tests_for", target="...")` only for the concrete target being changed.
- After edits: call `detect_changes(detail_level="minimal")` once when the graph was used or the change has meaningful blast radius.
- Before submitting: use `get_affected_flows()` or `get_suggested_questions()` only if unresolved structural risk remains.
- Finding code: prefer `semantic_search_nodes` when semantic graph search is likely to beat a direct repository search.
- Budget: no more than three graph calls per work item. Treat `next_tool_suggestions` as optional hints and never follow them recursively.

## Planning context proposals

When an active structured-plan task has implementation targets, call AIOS MCP `aios_plan_task` with `action="propose_context"`, the task id, and workspace-relative targets when the task has none. The tool derives target, caller, callee, and test candidates from codemap, but it does not modify the active plan. Present the candidate refs to a human. An explicit human-controlled CLI confirmation with `aios plan task <id> --confirm-context-candidates` (optionally repeated `--candidate-ref <ref>`) activates selected refs for orchestration; it is a process boundary, not an identity/authentication boundary. Do not claim context will be delivered before that command succeeds.
