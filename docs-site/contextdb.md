---
title: ContextDB: Pull-Based Project Memory
description: Understand the local ContextDB registry, memo storage, unified project search, lazy loading, and cross-client memory boundaries.
---

# ContextDB

## Quick Answer

ContextDB is Harness CLI's local project-memory layer. It records sessions, events, checkpoints, memos, and context-pack references under the project workspace so a supported client can find relevant facts across sessions. The current setup is pull-based: the project registry points the client to available sources, and the agent recalls what the task needs instead of receiving the entire history every time.

## Do it now

From the project root:

~~~bash
aios init --all
aios doctor --native --verbose
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
~~~

The marker added by current initialization points to .aios/context-db/index.json.

## The local registry

The registry is a small map of available sources. A typical workspace contains:

~~~text
.aios/
  context-db/
    index.json                 # source registry
    sessions/<session-id>/     # session events and checkpoints
    index/                     # derived search data
    exports/                   # context packs and handoffs
  memo/
    file/events.jsonl          # canonical append-only project memos
    split/                     # optional one-file-per-memo backend
~~~

The exact files vary with the client and commands that have run. The registry is a pointer to sources, not a copy of every file in the repository.

## How pull-based recall works

~~~text
client starts
  -> reads AGENTS.md, CLAUDE.md, GEMINI.md, or client guidance
  -> finds .aios/context-db/index.json
  -> checks source metadata and task relevance
  -> searches or reads a handoff, memo, checkpoint, or context pack
  -> continues with only the evidence needed for the current task
~~~

This model improves context control, but it does not guarantee a particular prompt size or startup time. If the required source is missing, stale, or outside the active project, the client must be given a new explicit pointer.

## What ContextDB records

| Source | Examples | Use |
| --- | --- | --- |
| Session events | prompts, tool results, errors, changed paths | reconstruct what happened |
| Checkpoints | goal, status, next step, evidence | resume a long task |
| Memos | project decisions, constraints, reminders | preserve durable facts |
| Context packs | bounded history exports | hand off a selected slice of context |
| Unified search | memory, plans, docs, and code references | locate evidence before broad reads |

ContextDB does not turn an unverified agent response into evidence. Tests, diagnostics, review records, and privacy checks remain separate quality gates.

## Memory With Memo {#memory-with-memo}

### Workspace Memory AIOS Memo {#workspace-memoryaios-memo}

Memos are durable project notes. The default canonical backend is append-only JSONL under .aios/memo/file/events.jsonl; split storage is optional.

~~~bash
aios memo add "Keep authentication tests strict"
aios memo pin add "Do not push directly to main"
aios memo search "authentication"
aios memo recall "release readiness" --limit 5
aios memo storage status
~~~

Switch or inspect storage deliberately:

~~~bash
aios memo storage use split
aios memo storage use file
aios memo storage rebuild
aios memo storage doctor
~~~

Rebuild updates derived query files; it does not rewrite canonical memo records.

## Unified Project Search (v1.50.0) {#unified-project-search-v1500}

Use unified search before broad grep or reading a whole repository:

~~~bash
node scripts/aios.mjs search "native client guidance" --agent codex-cli --json
node scripts/aios.mjs search "release blocker" --source memory,plans
node scripts/aios.mjs search "browser MCP" --source docs,code --limit 8
~~~

| Source | Includes | Good for |
| --- | --- | --- |
| memory | project-shared and permitted private memos | decisions and handoffs |
| plans | docs/plans and implementation plans | intended work and checkpoints |
| docs | README, native instructions, and public docs | runbooks |
| code | scripts, mcp-server, tests, and config | implementation facts |
| all | every supported source | first targeted lookup |

Project-shared memos are visible across supported clients. Agent-private notes require the matching runtime client id, such as codex-cli, claude-code, gemini-cli, opencode-cli, hermes-agent, or grok-build.

## Lazy Load (Fast Startup) {#lazy-load}

Interactive sessions use lazy context loading by default. To request a full context load for a compatibility workflow:

~~~bash
export CTXDB_LAZY_LOAD=0
~~~

When aios init has created the registry marker, the client can use the registry and facade guidance to discover context. Legacy or unwrapped clients may use a compatibility fallback. Lazy loading is a context-selection behavior, not a promise that every source is available or that a client will query it automatically.

## Context packs and manual control

Use a bounded context pack when you need a handoff or a selected history slice:

~~~bash
cd mcp-server
npm run contextdb -- context:pack \
  --session <session-id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
~~~

For lower-level work, the ContextDB CLI also supports:

~~~bash
npm run contextdb -- init
npm run contextdb -- session:new --agent codex-cli --project my-app --goal "fix auth bug"
npm run contextdb -- checkpoint --session <id> --summary "auth fix done" --status running
npm run contextdb -- index:rebuild
~~~

Use manual commands when diagnosing storage or building a reproducible handoff. Most users should start with aios init and the native doctor.

## Cross-client memory and privacy

Different clients can share one project registry when their integrations are supported and synchronized. The registry does not grant one client access to another client's private home configuration. Run aios doctor --native --verbose to inspect actual coverage.

Project files are local, but an agent can still send selected content to its configured model provider. Optional package installation and MCP registration can access their own network resources. Read sensitive files through a redaction workflow before sharing them.

## Legacy compatibility

Older wrappers and scripts may recognize .contextdb-enable as an opt-in marker. Current onboarding uses aios init and .aios/context-db/index.json. Keep the legacy switch only when a compatibility workflow explicitly requires it; it is not a replacement for initialization or verification.

## FAQ

### Is ContextDB a cloud database?

No. The registry, session data, exports, and canonical memos are local workspace files. Client providers and optional integrations have separate network boundaries.

### Do different agents share the same memory?

They can share the same project ContextDB when each client is supported and synchronized. Shared storage does not mean every client has identical route, skill, or MCP capabilities.

### What happens after /new or /clear?

Those commands reset the in-terminal conversation. The project files remain. Start a new client session and use the registry, unified search, or a named context pack to recall relevant evidence.

### Can I disable memory?

Stop the client, inspect the project guidance, and remove or adjust the current integration marker according to that client. Remove .contextdb-enable only if an older compatibility workflow used it. Deleting a marker does not erase existing .aios data.

### What can I safely delete?

Derived index files can be rebuilt. Treat sessions, exports, and memo JSONL as source data; back them up before deletion. Never delete credentials or client configuration as a generic cleanup step.

## Where to go next

- [Quick Start](getting-started.md) - install and initialize the project.
- [Workflow Policy](workflow-policy.md) - choose direct, guarded, or planned work.
- [Token Intelligence](token-compression.md) - keep context useful without unsupported compression claims.
- [Architecture](architecture.md) - see how the runtime layers connect.
- [Troubleshooting](troubleshooting.md) - recover a missing registry or failed sync.
