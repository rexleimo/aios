## AIOS Native WorkBuddy Layer

- Prefer repo-local `.workbuddy/skills` for AIOS-managed project skills; user-level `~/.workbuddy/skills` stays personal.
- Keep work grounded in the AIOS runtime and verification flow.
- MCP servers live in `~/.workbuddy/mcp.json` under `mcpServers`; there is no project-scope MCP file.
- WorkBuddy has no standalone CLI binary, so AIOS harness/team routes do not spawn it as a subprocess; orchestration runs inside the agent session.
- Follow the shared workflow policy before selecting a plan, skill, team, or harness route.
- Token compression is handled by community tools RTK + Caveman (installed via `aios init`).
