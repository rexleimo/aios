## Context System (ContextDB + Registry)

This project uses a pull-based context system. Context is NOT injected into every session.
Instead, a lightweight registry index tells you where to find it.

### Quick Start
1. On first load, try to read `memory/context-db/index.json` — the context registry.
2. If the file doesn't exist, this is a fresh session — proceed with the user's task.
3. If it exists, it lists available sources with cost, priority, and tags.
4. Load only the sources relevant to the current task.
5. Default: load `handoff` for session continuity. Skip `perception` for coding tasks.

### Source Selection by Task Type
| Task type | Load |
|-----------|------|
| Continue previous work | handoff (required) |
| Code/implement/fix | handoff, skip perception/history |
| Analyze XHS data | handoff + perception |
| Debug a failure | handoff + session-history |
| Team/harness route | handoff + task-router |

### Persisting Across Sessions
Before finishing significant work or hitting a blocker:
- `aios memo add "describe progress and next step"`
- `aios memo pin add "critical fact for future sessions"`

Do NOT save routine progress or trivial updates.

### Persona & User Profile
- `aios memo persona ...` manages `~/.aios/SOUL.md` (agent identity)
- `aios memo user ...` manages `~/.aios/USER.md` (operator preferences)
- These are stable guidance, not task facts. Project-specific facts go through ContextDB.
