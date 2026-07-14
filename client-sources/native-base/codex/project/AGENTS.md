## AIOS Native Codex Layer

- Prefer repo-local `.codex/skills` and `.codex/agents`.
- Codex native skill discovery is sufficient; use no SessionStart bootstrap and do not inject `using-superpowers` for every turn.
- Let the shared workflow policy choose `direct`, `guarded`, or `planned`, then keep work grounded in the AIOS runtime and verification flow.
