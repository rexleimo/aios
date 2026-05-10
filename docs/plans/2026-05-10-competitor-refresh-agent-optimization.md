# Competitor Refresh & Agent Capability Optimization

Date: 2026-05-10

## Scope

Full competitor metadata refresh + shallow clone analysis + implementation of 4 P0 agent capability optimizations based on competitor signals.

## Competitor Refresh Summary

### New Competitors Added

| Project | Category | Priority | Key Signal |
|---------|----------|----------|------------|
| `jayminwest/overstory` v0.11.0 | Multi-agent orchestration | P0 | SQLite mail bus, Web UI fleet management, 11 runtime adapters, git worktree isolation |

### Key Movements (since May 6)

| Signal | Detail | AIOS Implication |
|--------|--------|-----------------|
| oh-my-openagent Team Mode v4.0 | Lead + 8 parallel members, discipline agents (Sisyphus/Hephaestus/Prometheus), IntentGate, multi-model (Opus/K2.6/GPT-5.5/GLM-5.1) | Must adopt multi-model discipline agents, intent analysis gate, skill-scoped MCP, completion enforcement |
| overstory v0.11.0 | SQLite mail system coordination, Web UI, 11 runtimes, tiered conflict resolution | Direct overlap with AIOS team runtime; adopt mail-based agent communication |
| OpenHarness auto-dream | Memory consolidation during idle, 43+ tools, React TUI | ContextDB should add background consolidation |
| golutra CEO Agent roadmap | Month-long autonomous coordinator, infinite agent network, self-evolution | Long-horizon autonomous coordination is the next frontier |
| OpenViking L0/L1/L2 | Tiered context loading, retrieval trajectory visualization | Token budget tiered loading is proven; must adopt |
| gnhf v0.1.41 | Agent skill bundled in npm package | AIOS should bundle agent-facing skill files |

### Updated Stars (May 10)

| Project | Stars (May 6) | Stars (May 10) | Delta |
|---------|--------------|----------------|-------|
| OpenClaw | 368,841 | 370,251 | +1,410 |
| superpowers | 179,914 | ~180K+ | stable |
| Hermes-agent | 134,949 | ~135K+ | stable |
| OpenViking | 23,518 | 23,706 | +188 |

## Implemented Optimizations

### 1. Multi-Model Discipline Agent Routing

**Source**: oh-my-openagent discipline agents (Sisyphus/Hephaestus/Prometheus)

**Files changed**:
- `memory/specs/model-registry.json` — added 8 discipline agent role mappings
- `scripts/lib/model-router.mjs` — added `preferredModel` priority logic

**Role → Model mapping**:
| Role | Model | Rationale |
|------|-------|-----------|
| discipline-planner | claude-opus | Planning needs strongest reasoning |
| discipline-builder | gpt-5.5 | Deep implementation needs long context |
| discipline-reviewer | claude-sonnet | Review needs balance of speed/quality |
| discipline-orchestrator | glm-5.1 | Orchestration needs global view |
| discipline-explorer | gemini-3-pro | Research needs multimodal + recall |
| team-lead | claude-opus | Lead needs strongest planning |
| team-member | gpt-5.5 | Members need deep execution |

**How it works**: When a blueprint specifies a role (e.g., `discipline-planner`), `resolveModelForRole()` first checks env overrides, then `preferredModel` from roleDefaults, then falls back to the routing rule for the task type.

### 2. Todo Enforcer Idle Detection

**Source**: oh-my-openagent Todo Enforcer + gnhf stall detection

**Files changed**: `scripts/lib/lifecycle/watchdog.mjs`

**New exports**:
- `buildIdleDetector(options)` — configure thresholds
- `detectIdleState(signals, config)` — detect if agent is idle based on commit/file/log age
- `decideNudgeAction(idleState, nudgeCount, config)` — decide nudge vs blocked escalation
- `runTodoEnforcerLoop(options, context)` — full loop: detect → nudge → escalate

**Defaults**:
- Check interval: 30s
- Idle threshold: 120s (all signals stale + CPU dead)
- Max nudges: 3, then escalate to `blocked`

### 3. ContextDB L0/L1/L2 Tiered Loading

**Source**: OpenViking tiered context loading

**Files changed**: `scripts/lib/contextdb/facade.mjs`

**New exports**:
- `CONTEXT_TIERS` — L0(2K)/L1(5K)/L2(10K) token budget constants
- `TIER_BUDGET_MAP` — budget level → tiers (`low`/`medium`/`high`)
- `classifyMemoryTier(memory)` — auto-classify based on kind, age, access count
- `filterMemoriesByBudget(memories, budget)` — filter + sort within token budget

**Tier classification logic**:
- L0: task instructions, plans, checkpoints, anything <1h old
- L1: related history, project knowledge, recent memories
- L2: archived, rarely accessed (>7 days, <2 accesses)

### 4. Skill-Scoped MCP Server Definitions

**Source**: oh-my-openagent skill-embedded MCPs

**Files changed**: `memory/skills/发布笔记.json` (示范)

**New field**: `mcp_servers` array per skill:
```json
"mcp_servers": [
  {
    "id": "server-id",
    "description": "what it does",
    "command": "npx",
    "args": ["-y", "package@latest"],
    "start_when": "on_skill_activate",
    "stop_when": "on_skill_deactivate"
  }
]
```

**Purpose**: Skills carry their own MCP server dependencies. Runtime loads on demand instead of global context bloat.

## Data Updates

- `memory/knowledge/competitor-watchlist.json` — refreshed May 10, added overstory
- `memory/knowledge/competitor-analysis.md` — added May 10 section with all new signals
- `temp/competitor-repos/` — fresh shallow clones of all P0 competitors

## Not Yet Implemented (P1 backlog)

| # | Feature | Source | Priority |
|---|---------|--------|----------|
| 5 | SQLite mail bus agent communication | overstory | P1 |
| 6 | Web UI fleet management | overstory | P1 |
| 7 | Agent skill npm packaging | gnhf | P1 |
| 8 | Retrieval trajectory visualization | OpenViking | P2 |
| 9 | CEO Agent long-horizon coordination | golutra roadmap | P2 |
| 10 | IntentGate intent analysis | oh-my-openagent | P1 |
