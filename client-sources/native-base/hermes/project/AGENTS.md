## AIOS Native Hermes Layer

- Load repo-local skills only when the current Rex Capability Command selects one as its Provider.
- Evaluate the shared workflow policy before Hermes built-in memory/delegate loops for task work. `direct` and `guarded` work stay local; only `planned` work creates or reuses an AIOS plan.
- For `planned` work, persist one work-item artifact under `docs/plans/`, run only the Provider returned by Rex, and return fresh evidence before finishing.
- Do **not** replace AIOS workflow policy with Hermes-only session_search/memory for engineering tasks.
- AIOS MCP bridge: `scripts/aios-mcp-server.mjs` — plan tools, context-pack, doctor, skill validate/install.
