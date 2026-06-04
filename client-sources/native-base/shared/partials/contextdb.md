## Context System (ContextDB + Registry)

This project uses a pull-based context system. Context is NOT injected into every session.
Instead, a lightweight registry index tells you where to find it.

### Quick Start
1. On first load, try to read `.aios/context-db/index.json` — the context registry.
2. If the file doesn't exist, this is a fresh session — proceed with the user's task.
3. If it exists, it lists available sources with cost, priority, and tags.
4. Load only the sources relevant to the current task.
5. Default: load `handoff` for session continuity. Skip `perception` for coding tasks.
6. Legacy `memory/context-db/index.json` is read only for compatibility when `.aios/context-db/` is absent.

Generated AIOS runtime state should stay under `.aios/` (`.aios/context-db`, `.aios/workspace`, `.aios/tasks`). Legacy `memory/context-db`, `memory/workspace`, and `tasks` are compatibility read paths, not fresh-write targets.

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

### Memo Scope Rules
Project memory must survive client switches. By default, `aios memo add ...` writes `scope=project_shared`, so Codex, Claude, OpenCode, Gemini, Antigravity, and Crush can all recall the same project facts.

Use agent-private memory only for client-specific scratch notes that should not pollute other clients:
- `aios memo add "codex-only scratch note" --scope agent_private --agent codex-cli`
- `aios memo list --agent claude-code` shows project-shared records plus Claude-private records, but not Codex-private records.

Never store global project decisions, architecture facts, task handoffs, release blockers, or user preferences as `agent_private`. Those belong in the default `project_shared` scope or pinned project memo.

### Unified Project Search
Before ad-hoc grep or broad file reads, use unified search when you need project memory, docs, plans, and code references together:

```bash
node scripts/aios.mjs search "<query>" --agent <runtime-client-id> --json
```

Use `--source memory,plans` for memory plus plan recall, `--source docs,code` for repo reference lookup, and `--scope agent_private --agent <runtime-client-id>` only when intentionally searching that agent's private scratch notes. The command preserves `project_shared` visibility across clients and filters other agents' private memos.

### Persona & User Profile
- `aios memo persona ...` manages `~/.aios/SOUL.md` (agent identity)
- `aios memo user ...` manages `~/.aios/USER.md` (operator preferences)
- These are stable guidance, not task facts. Project-specific facts go through ContextDB.
