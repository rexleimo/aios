## Context System (ContextDB + Registry)

This project uses a pull-based context system. Runtime context is NOT automatically injected into model prompts.
Stable workflow constraints live in checked-in instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and repo-local skills). Runtime state lives in `.aios/` and is loaded only when the user asks to continue or the current task clearly needs it.

### Quick Start
1. On first load, try to read `.aios/context-db/index.json` — the context registry.
2. If the file doesn't exist, this is a fresh session — proceed with the user's task.
3. If it exists, it lists available sources with cost, priority, and tags.
4. Load only the sources relevant to the current task.
5. Default: do not load session history. Load `handoff` only after the user confirms resume/continue or the task explicitly references prior work. Skip `perception` for coding tasks.
6. Legacy `memory/context-db/index.json` is read only for compatibility when `.aios/context-db/` is absent.

Generated AIOS runtime state should stay under `.aios/` (`.aios/context-db`, `.aios/workspace`, `.aios/tasks`). Legacy `memory/context-db`, `memory/workspace`, and `tasks` are compatibility read paths, not fresh-write targets.

### Prompt Injection Policy
- Do not inject ContextDB packets, recent events, checkpoints, handoff prompts, persona overlays, user overlays, or router guides into ordinary startup or one-shot prompts.
- Startup may show a short local unfinished-task summary to the user, but it must not pass that summary as model input.
- `contextdb context:pack` is a manual export/debug tool. It may write files for inspection, but its output is not default prompt input.
- If the user says "continue", "resume", "继续", or selects an unfinished task, read only the listed task/handoff files needed for that continuation.
- Stable rules belong in native instruction files and skills, not in repeated runtime prompt injection.

### Source Selection by Task Type
| Task type | Load |
|-----------|------|
| All task types | project-memory (auto-recall REQUIRED — see Memo Auto-Recall above) |
| Continue previous work | selected task + handoff after user confirmation |
| Code/implement/fix | static instructions + targeted repo search; skip perception/history by default |
| Analyze XHS data | targeted perception only when analytics context is explicitly needed |
| Debug a failure | targeted event/checkpoint search; do not load full session history by default |
| Team/harness route | static workflow instructions + explicit plan/handoff files only |

### Persisting Across Sessions
Before finishing significant work or hitting a blocker:
- `aios memo add "describe progress and next step"`
- `aios memo pin add "critical fact for future sessions"`

Do NOT save routine progress or trivial updates.

### Memo Auto-Recall (MANDATORY — prevents session amnesia)

Before answering any question that may involve project-specific knowledge, run memo recall:

**Trigger keywords** — the user's query contains any of:
- Project architecture, past decisions, conventions, or workflows
- References to previous work, releases, fixes, or changes in this project
- "how does X work", "why was Y changed", "what was the Z fix"
- "怎么实现", "为什么改", "为什么重构", "修过什么", "有什么改动"
- "continue", "resume", "上次", "继续", "之前"
- Reference to any past event, bug, change, or decision in this project
- Any question that starts with vague domain context a fresh session wouldn't know

**Required action** (run BEFORE answering):

1. Run recent-context recall first:
```bash
node scripts/aios.mjs memo recall --limit 5
```

2. If recall returns relevant context, use it and proceed. If recall is empty or the user query is long, distill the query to 2-3 core technical terms before searching:
   - Extract: module names, feature names, file names, technical concepts
   - Strip: conversational filler, instructions to you, formatting
   - Use individual keywords (space = AND in memo search; multi-word queries may produce zero hits if the exact phrase doesn't appear in memos):
```bash
node scripts/aios.mjs memo search "<distilled keyword>" --limit 5
```

3. If the first keyword yields no results, try the next one. Combine the 2 best keywords only when each individually returns relevant hits.

4. Only if memo search also returns nothing should you fall through to Unified Project Search below.

### Memo Scope Rules
Project memory must survive client switches. By default, `aios memo add ...` writes `scope=project_shared`, so Codex, Claude, OpenCode, and Gemini can all recall the same project facts.

Use agent-private memory only for client-specific scratch notes that should not pollute other clients:
- `aios memo add "codex-only scratch note" --scope agent_private --agent codex-cli`
- `aios memo list --agent claude-code` shows project-shared records plus Claude-private records, but not Codex-private records.

Never store global project decisions, architecture facts, task handoffs, release blockers, or user preferences as `agent_private`. Those belong in the default `project_shared` scope or pinned project memo.

### Unified Project Search (mandatory fallback)

**Before any ad-hoc grep or broad file reads**, use unified search to check project memory, docs, plans, and code references:

```bash
node scripts/aios.mjs search "<query>" --agent <runtime-client-id> --json
```

Use `--source memory,plans` for memory plus plan recall, `--source docs,code` for repo reference lookup, and `--scope agent_private --agent <runtime-client-id>` only when intentionally searching that agent's private scratch notes. The command preserves `project_shared` visibility across clients and filters other agents' private memos.

### Persona & User Profile
- `aios memo persona ...` manages `~/.aios/SOUL.md` (agent identity)
- `aios memo user ...` manages `~/.aios/USER.md` (operator preferences)
- These are stable guidance, not task facts. Project-specific facts go through ContextDB.
