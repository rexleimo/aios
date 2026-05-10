# Memory System Optimization: Layered Memory with Agent Views

**Date**: 2026-05-10
**Status**: Approved
**Scope**: Multi-agent memory sharing, retrieval efficiency, automated maintenance

## Problem

The AIOS memory system works for single-agent sessions but has comprehensive issues in multi-agent collaboration:

1. **Context loss**: Sub-agents start without parent agent context; information must be re-explained
2. **Write conflicts**: Multiple agents writing memory simultaneously can overwrite each other
3. **No handoff protocol**: Agent-to-agent context transfer is ad-hoc and unstandardized
4. **Retrieval waste**: All skills/knowledge loaded regardless of task relevance (~2000 tokens per session)
5. **Manual maintenance**: Skill indexing, competitor sync, and knowledge snapshots require manual triggers

## Design: Layered Memory + Agent Views

### Architecture Overview

```
memory/
├── workspace/                    # NEW: Shared workspace for all agents
│   ├── meta.json                 # Version & last-update metadata
│   ├── project-context.md        # Auto-generated project summary (~300 tokens)
│   ├── active-skills.json        # Skill index (summaries only, not full JSON)
│   ├── task-board.json           # Cross-agent task tracking
│   ├── knowledge-snapshot.json   # Curated knowledge subset
│   └── conflicts/                # Conflict markers when optimistic lock fails
├── context-db/                   # EXISTING: Per-session persistence (unchanged)
│   ├── sessions/{agent}-{id}/
│   └── ...
├── skills/                       # EXISTING: Full skill definitions (unchanged)
├── specs/                        # EXISTING: Safety & config (unchanged)
├── knowledge/                    # EXISTING: Full knowledge base (unchanged)
└── history/                      # EXISTING: Operation archive (unchanged)
```

### Section 1: Workspace Shared Layer

The `workspace/` directory is the single source of truth for cross-agent shared state.

**meta.json**:
```json
{
  "schemaVersion": 1,
  "workspaceVersion": 1,
  "lastUpdatedAt": "2026-05-10T12:00:00Z",
  "lastUpdatedBy": "claude-code-session-abc123",
  "projectName": "aios"
}
```

- `workspaceVersion` increments on every write; agents check this before writing (optimistic locking)
- `lastUpdatedBy` tracks which session made the last change (audit trail)

**project-context.md**: Auto-generated summary of the project state, capped at ~300 tokens. Refreshed whenever workspace content changes significantly.

**active-skills.json**: Skill index with summaries — not full skill JSON. Each entry has: name, file path, keywords, taskTypes, version, lastUsed timestamp.

**task-board.json**: Cross-agent task tracking with status, assigned agent, and dependencies.

**knowledge-snapshot.json**: Curated subset of knowledge base relevant to current active tasks. Not a full copy of `knowledge/`.

### Section 2: Agent View

Each agent session constructs an AgentView at startup by inheriting from workspace + loading private session data.

**AgentView interface**:
```typescript
interface AgentView {
  // Inherited from workspace (shared, read-mostly)
  workspaceVersion: string;
  projectContext: string;
  relevantSkills: SkillSummary[];    // Filtered by task type
  activeTasks: TaskItem[];

  // Private (from session context-db)
  sessionId: string;
  continuity?: HandoffPacket;
  localEvents: ContextEvent[];
}
```

**Loading strategy** (tiered):

| Tier | When | What | Token Budget |
|------|------|------|-------------|
| T0 | Startup (always) | `meta.json` + `project-context.md` | ~500 |
| T1 | Task routing | Relevant skill summaries from `active-skills.json` | ~200-500 |
| T2 | Execution | Full skill JSON (only the active one) | ~200-1000 |
| T3 | On demand | Knowledge entries, history lookups | Variable |
| - | Excluded | Other agents' sessions, history archive, unrelated skills | 0 |

### Section 3: Handoff Protocol v2

Extends the existing `continuity.json` with a structured HandoffPacket.

**HandoffPacket interface**:
```typescript
interface HandoffPacket {
  schemaVersion: 2;

  fromAgent: {
    sessionId: string;
    agentType: "claude-code" | "codex" | "gemini";
    role: "planner" | "implementer" | "reviewer" | "orchestrator";
  };

  intent: string;                    // Task goal
  progress: string;                  // Current state
  nextActions: string[];             // What to do next
  blockers: string[];                // What's blocked

  touchedFiles: string[];            // Modified files
  workspaceChanges: WorkspaceDiff[]; // Workspace mutations
  pendingWrites: string[];           // Unflushed workspace changes

  confidence: "high" | "medium" | "low";
  assumptions: string[];             // Assumptions the next agent should verify
}
```

**WorkspaceDiff**:
```typescript
interface WorkspaceDiff {
  file: string;                      // e.g., "workspace/task-board.json"
  operation: "create" | "update" | "delete";
  summary: string;                   // Human-readable description of the change
}
```

**Handoff flow**:
1. Agent A finishes work → generates HandoffPacket
2. Agent A writes workspace changes (optimistic lock check)
3. Agent A saves HandoffPacket to `session/continuity.json`
4. Agent B starts → reads workspace (gets Agent A's changes)
5. Agent B reads Agent A's `continuity.json` (gets handoff info)
6. Agent B validates assumptions and continues with nextActions

**Conflict resolution**:
- Optimistic locking via `workspaceVersion` in `meta.json`
- On conflict: do NOT overwrite; generate conflict marker in `workspace/conflicts/{timestamp}.json`
- Pause and prompt user for manual resolution

### Section 4: Retrieval Optimization

**Skill index in active-skills.json**:
```typescript
interface SkillIndex {
  skills: {
    name: string;          // "发布笔记"
    file: string;          // "memory/skills/发布笔记.json"
    keywords: string[];    // ["发布", "笔记", "小红书"]
    taskTypes: string[];   // ["content-publish", "xhs-ops"]
    version: number;
    lastUsed?: string;
  }[];
}
```

Agents match their task type against `taskTypes` to load only relevant skill summaries at T1, then load the full skill JSON at T2 only for the skill they're about to execute.

**project-context.md auto-generation**: Whenever workspace content changes, check if the project summary needs updating. If key facts changed (active skills, task status, knowledge updates), regenerate the summary.

### Section 5: Automated Maintenance

**memory doctor command**: Run at agent startup or manually.

Checks:
- Workspace version consistency (meta.json vs actual files)
- Orphaned sessions (status=running but expired >24h)
- Skill file vs active-skills.json index drift
- knowledge-snapshot.json vs knowledge/ directory drift
- Token budget estimate for current load

**Auto-sync triggers**:
- `memory/skills/` file modification → update `active-skills.json` summary + version
- `memory/knowledge/` changes → refresh `knowledge-snapshot.json`
- History entries older than 7 days → auto-compress into monthly archives
- Competitor watchlist → scheduled sync via harness/cron (not manual)

## Migration Path

This is a gradual migration — no breaking changes to existing ContextDB:

1. **Phase 1**: Create `workspace/` with meta.json, active-skills.json index (read-only, manual sync)
2. **Phase 2**: Add HandoffPacket v2 to continuity.json, implement optimistic locking
3. **Phase 3**: Auto-sync (skill index, knowledge snapshot), memory doctor command
4. **Phase 4**: project-context.md auto-generation, task-board.json, full integration

Each phase is independently deployable and backward-compatible.

## Out of Scope

- Knowledge graph / semantic search (future consideration)
- Real-time agent communication (pub/sub bus)
- Distributed locking across machines
- Compression/encryption of memory files
