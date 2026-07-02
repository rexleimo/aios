## AIOS Native Hermes Layer

- Prefer repo-local `.hermes/skills` for AIOS-enhanced skills.
- Keep work grounded in the AIOS runtime and verification flow.
- AIOS MCP server bridge is available via `scripts/aios-mcp-server.mjs` — expose context-pack and doctor as Hermes MCP tools. Token compression is handled by community tools RTK + Caveman (installed via `aios init`).
