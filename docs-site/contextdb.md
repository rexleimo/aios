---
title: ContextDB
description: How your agent remembers things across sessions — explained from the ground up.
---

# ContextDB

**The short version:** ContextDB is a local memory system for your coding agents. It remembers what happened in past sessions so your agent can pick up where it left off.

No cloud. No database server. Just files in your project folder.

## Context Registry (Pull-Based Context)

Starting in v1.13, ContextDB uses a **pull-based** model. Instead of injecting ~30KB of context into every session startup (which took ~5 minutes), the system now injects a ~350 byte **registry pointer** and the agent loads what it needs on demand.

### How It Works

```
Agent starts → reads config file (CLAUDE.md / AGENTS.md / GEMINI.md)
           → sees marker: <!-- AIOS: .aios/context-db/index.json -->
           → reads .aios/context-db/index.json (the registry)
           → decides what to load based on the task

Task: "fix the auth bug"  → loads handoff (1KB) for continuity
Task: "analyze XHS data"  → loads handoff + perception (~4KB)
Task: "debug a crash"     → loads handoff + session history (~20KB)
```

### Registry Index (index.json)

```json
{
  "session": "claude-code-20260515T...",
  "status": "running",
  "sources": [
    {"id": "handoff", "cost": "~1KB", "priority": "high",
     "path": ".aios/context-db/sessions/xxx/handoff.json"},
    {"id": "session-history", "cost": "~20KB", "priority": "low",
     "path": ".aios/context-db/exports/latest-claude-code-context.md"},
    {"id": "perception", "cost": "~3KB", "priority": "low",
     "path": ".aios/context-db/exports/latest-perception.md"}
  ]
}
```

### Before vs After

| | Before (Push) | After (Pull) |
|---|---|---|
| Startup injection | ~30KB (~12K tokens) | ~350 bytes |
| Startup wait | ~5 minutes | Near-instant |
| Context loading | Everything, every time | On-demand, task-aware |
| Cross-agent memory | Each agent isolated | Shared ContextDB |

### Setup

```bash
aios init              # one-time setup for all installed agents
```

The `aios init` command adds the registry marker to each agent's config file and configures save guards so sessions are automatically persisted.

## Why Does This Matter?

Here's the problem RexCLI solves:

```
Day 1: You work on a feature with your agent. Great progress.
Day 2: You open the terminal again. Your agent has NO IDEA what happened yesterday.
       You have to explain everything from scratch. Again.
```

ContextDB fixes this. When you start your agent in a project with `.contextdb-enable`, it automatically loads context from previous sessions.

```bash
cd your-project    # Where .contextdb-enable exists
codex              # Agent loads previous context automatically
```

## How It Works (The Simple Version)

Think of ContextDB like a **lab notebook** for your agent:

1. **Events** — Every time you or the agent does something, it's recorded
2. **Checkpoints** — At important moments, a summary is saved
3. **Context packs** — When a new session starts, all relevant history is bundled up and given to the agent

```
┌─────────────────────────────────────────┐
│  Your Project                           │
│  ├── .contextdb-enable                  │
│  └── .aios/context-db/                  │
│      ├── sessions/                      │  ← Recorded events
│      ├── index/                         │  ← Search index
│      └── exports/                       │  ← Context packs
└─────────────────────────────────────────┘
```

All of this lives in your project folder. Nothing is sent anywhere.

## Getting Started

### Enable Memory For A Project

```bash
cd /path/to/your/project
touch .contextdb-enable
codex
```

That's it. From now on, every session in this project is recorded.

### What Gets Remembered?

| Type | Example |
|---|---|
| Prompts you sent | "Refactor the auth module" |
| Code the agent wrote | Files created or modified |
| Errors encountered | Stack traces, failed builds |
| Decisions made | "Use Redis for caching instead of Memcached" |
| What's left to do | "Still need to write integration tests" |

### How Sessions Work

Each time you start your agent, ContextDB creates a new **session**. Sessions are linked together so the agent can see the full history.

Session IDs look like: `claude-code-20260419T095454-e6eb600d` (agent name + timestamp + random ID).

## Memory With Memo

ContextDB is automatic, but sometimes you want to **manually** save important notes. That's what Memo is for.
Project memos now use Git-friendly canonical storage under `memory/memo/`: `file` is the default append-only JSONL backend, while `split` stores one JSON file per memo event. ContextDB mirrors are kept only for compatibility/cache.

### Quick Memo Commands

```bash
# Save a note about this project
aios memo add "This project uses strict TypeScript — no any types"

# Pin something important (always visible)
aios memo pin add "Never push directly to main branch"

# Search your notes
aios memo search "typescript"
aios memo search "testing"

# Check or switch the storage implementation
aios memo storage status
aios memo storage use split
aios memo storage use file
aios memo storage rebuild
aios memo storage doctor
```

`aios memo storage rebuild` is a full rebuild of derived query files only; it does not rewrite canonical memo records.

### Recall Across Sessions

```bash
# Find notes from past sessions about a topic
aios memo recall "database migration" --limit 5
```

### Persona: Set Your Agent's Style

Want your agent to always respond in a certain way? Set a persona:

```bash
aios memo persona init
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo persona add "Always explain WHY, not just WHAT"
```

### User Profile: Set Your Preferences

Tell the agent about yourself:

```bash
aios memo user init
aios memo user add "Preferred language: zh-CN + technical English terms"
aios memo user add "I'm a senior engineer — skip beginner explanations"
```

Persona and user profile are **global** — they apply to all your projects.

## Searching Your History

ContextDB builds a search index so you (and your agent) can find past work:

```bash
# Search for past events
npm run contextdb -- search --query "auth bug" --project my-app

# View a timeline of what happened
npm run contextdb -- timeline --session <session-id> --limit 30
```

The search uses SQLite under the hood with full-text search (FTS5 + BM25 ranking).

## Token Compression (Keeping Context Small)

The more history you have, the bigger the context pack gets. Token compression keeps it manageable.

### Why It Matters

AI models have a **context window limit**. If your project history is too long, it won't fit. Token compression:

1. Keeps the most important information (recent work, errors, decisions)
2. Compresses or removes less important stuff (repeated logs, verbose output)
3. Fits everything within a budget you control

### How To Use It

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

### Strategies

| Strategy | When to use |
|---|---|
| `balanced` | Default. Keeps recent + important, compresses the rest |
| `aggressive` | Very small budgets. Maximizes compression |
| `legacy` | Old behavior. Only keeps the tail end |

## Lazy Load (Fast Startup)

The Context Registry already makes startup near-instant by default (~350 byte injection). For sessions that need full context, lazy loading further optimizes:

- On startup: only the registry pointer is injected
- The agent reads the registry and loads what it needs on demand
- A background process rebuilds the full context pack when needed

Lazy load is **on by default** for interactive sessions. To force full context loading:

```bash
export CTXDB_LAZY_LOAD=0  # Load everything on startup (slower but complete)
```

When `aios init` has been run, slim mode is used automatically — the agent manages its own context via the registry. For unwrapped agents or legacy setups, full injection is preserved as fallback.

## Route Shortcuts

When you're inside a running agent, you can choose how to handle a task:

| Shortcut | Meaning |
|---|---|
| `/single <task>` | Handle in the current agent (default) |
| `/subagent <task>` | Staged orchestration with verification |
| `/team <task>` | Split across multiple agents |
| `/harness <task>` | Long-running overnight job |

These are installed automatically during setup. If they're missing:

```bash
aios doctor --native --fix
```

## Advanced: Manual Commands

Most of the time, ContextDB runs automatically. If you need manual control:

```bash
# Initialize ContextDB in a project
npm run contextdb -- init

# Create a new session
npm run contextdb -- session:new --agent codex-cli --project my-app --goal "fix auth bug"

# Add an event manually
npm run contextdb -- event:add --session <id> --role user --kind prompt --text "start"

# Create a checkpoint
npm run contextdb -- checkpoint --session <id> --summary "auth fix done" --status running

# Export a context pack
npm run contextdb -- context:pack --session <id> --out context.md

# Rebuild the search index
npm run contextdb -- index:rebuild
```

## Advanced: Configuration

| Variable | What it does | Default |
|---|---|---|
| `CTXDB_PACK_STRICT` | Fail if context pack can't be built | `0` (warn and continue) |
| `CTXDB_LAZY_LOAD` | Enable fast startup with lazy loading | `1` (on) |
| `CTXDB_INTERACTIVE_AUTO_ROUTE` | Show route shortcuts on startup | `1` (on) |
| `CTXDB_HARNESS_PROVIDER` | Default agent for harness runs | `codex` |
| `CTXDB_HARNESS_MAX_ITERATIONS` | Max loops for harness runs | `8` |
| `AIOS_IDENTITY_HOME` | Directory for persona/user files | `~/.aios` |
| `AIOS_PERSONA_MAX_CHARS` | Max size for persona file | `2400` |

## Common Questions

### Is ContextDB a cloud database?

No. It's just files in your project's `.aios/context-db/` folder. Nothing leaves your machine.

### Why does context disappear after `/new` or `/clear`?

Those commands reset the **in-terminal conversation**, but ContextDB is still on disk. To get context back:

1. Exit the agent and restart it — the wrapper reloads context automatically
2. Or ask the agent to read the latest snapshot: `@.aios/context-db/exports/latest-*-context.md`

### Do different agents share the same memory?

Yes. If you run `codex` and then `claude` in the same project, they read and write the same ContextDB. Claude will know what Codex did.

### Can I turn it off?

Yes. Just delete `.contextdb-enable` from the project root. Existing data stays on disk but new sessions won't be recorded.

### What's the `.aios/context-db/` folder?

```
.aios/context-db/
  sessions/          # Session files (the source of truth)
  index/             # SQLite search index (auto-rebuilt)
  exports/           # Context packs for agents to read
```

You can safely delete `index/` — it's rebuilt automatically. Don't delete `sessions/` unless you want to erase history.

## Where To Go Next

- [Quick Start](getting-started.md) — if you haven't set up yet
- [Agent Team](team-ops.md) — when one agent isn't enough
- [Solo Harness](solo-harness.md) — let agents work overnight
- [Token Compression](token-compression.md) — deep dive into keeping context small
- [Troubleshooting](troubleshooting.md) — fix common ContextDB issues
