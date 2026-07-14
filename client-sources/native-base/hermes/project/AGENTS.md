## AIOS Native Hermes Layer

- Prefer repo-local `.hermes/skills` for AIOS workflow playbooks (`writing-plans`, `brainstorming`, `verification-before-completion`, …).
- Evaluate the shared workflow policy before Hermes built-in memory/delegate loops for task work. `direct` and `guarded` work stay local; only `planned` work creates or reuses an AIOS plan.
- For `planned` work, select the relevant playbook, update the one work-item artifact under `docs/plans/`, and use verification when finishing.
- Do **not** replace AIOS workflow policy with Hermes-only session_search/memory for engineering tasks.
- AIOS MCP bridge: `scripts/aios-mcp-server.mjs` — plan tools, context-pack, doctor, skill validate/install.
