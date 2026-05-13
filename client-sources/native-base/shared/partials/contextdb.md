ContextDB remains the shared runtime layer for memory, checkpoints, and execution evidence.

Wrapped `codex` / `claude` / `gemini` / `opencode` sessions receive an AIOS startup route prompt. The agent should self-select `single`, `subagent`, `team`, or `harness` and run the matching AIOS command when the request warrants it.

Native route shortcuts may also be installed in the client home:
- Claude/Gemini/OpenCode: `/single <task>`, `/subagent <task>`, `/team <task>`, `/harness <task>`.
- Codex: `/prompts:single <task>`, `/prompts:subagent <task>`, `/prompts:team <task>`, `/prompts:harness <task>`.

Persona and user profile memory are part of the same runtime layer:
- `aios memo persona ...` manages the global agent identity file (`~/.aios/SOUL.md` by default).
- `aios memo user ...` manages the global operator preference file (`~/.aios/USER.md` by default).
- `ctx-agent` injects persona and user profile content into the Memory prelude before workspace memo content.
- Treat these files as stable guidance, not task facts; project-specific facts should still go through ContextDB events, checkpoints, or workspace memo.
