## AIOS Native Codex Layer

- Prefer repo-local `.codex/skills` and `.codex/agents`.
- Codex native skill discovery is sufficient; use no SessionStart bootstrap or fixed global skill chain.
- Native sync writes `.codex/hooks.json` (`aios plan hook-user-prompt --client codex`). Absent until `aios internal native update`.
- Let the shared workflow policy choose `direct`, `guarded`, or `planned`, then keep work grounded in the AIOS runtime and verification flow.
