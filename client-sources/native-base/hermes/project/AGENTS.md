## AIOS Native Hermes Layer

- Prefer repo-local `.hermes/skills` for AIOS planning skills (`writing-plans`, `brainstorming`, `verification-before-completion`, …).
- **ALWAYS-ON planning:** on **every** user message, call MCP `aios_plan_auto_gate` (or `aios_plan_start` + `aios_plan_status`) **before** Hermes built-in memory/delegate loops for task work.
- Keep work grounded in the AIOS runtime:
  1. `aios_plan_auto_gate` with the user message
  2. Follow `writing-plans` / update `docs/plans/`
  3. Implement only after the plan artifact reflects this message
  4. `aios_plan_gate` / verification when finishing
- Do **not** replace AIOS planning with Hermes-only session_search/memory for engineering tasks.
- AIOS MCP bridge: `scripts/aios-mcp-server.mjs` — plan tools, context-pack, doctor, skill validate/install.
