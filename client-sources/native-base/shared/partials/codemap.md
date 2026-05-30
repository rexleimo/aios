<!-- 中文注释：code-review-graph（codemap）MCP 决策检查点。所有已注册 MCP 的客户端均下发，让 gemini/opencode 也能用结构图。 -->

## AIOS Code-Review-Graph (codemap) MCP

This project exposes a structural knowledge graph via the `code-review-graph` MCP. Use it at each decision point in your workflow.

- Before doing anything → `get_minimal_context(task="...")` for project context + suggested next steps.
- Before modifying code → `get_impact_radius(detail_level="minimal")` to check blast radius, and `query_graph(pattern="tests_for", target="...")` to confirm tests exist (write tests first if not).
- After modifying code → `detect_changes(detail_level="minimal")` to verify actual impact matches expectations.
- Before submitting → `get_affected_flows()` + `get_suggested_questions()` as a final safety net.
- Finding code → `semantic_search_nodes` before grep. Always use `detail_level="minimal"` and follow each response's `next_tool_suggestions`.
