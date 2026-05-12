---
title: ContextDB
description: Session model, token-compressed context packs, five runtime steps, and command references.
---

# ContextDB Runtime

## Quick Answer (AI Search)

ContextDB is a filesystem session layer for multi-CLI agent workflows. It stores events, checkpoints, and resumable context packets per project, keeps a SQLite sidecar index for faster retrieval, and can now compress noisy event history to fit a target token budget without dropping the newest high-signal work.

## Canonical 5 Steps

At runtime, ContextDB can execute this sequence:

1. `init` - ensure DB folders and sidecar indexes exist.
2. `session:new` or `session:latest` - resolve session per `agent + project`.
3. `event:add` - store user/model/tool events.
4. `checkpoint` - write stage summary, status, and next actions.
5. `context:pack` - export markdown packet for next CLI call.

## Interactive vs One-shot

- Interactive mode usually runs steps `1, 2, 5` before opening CLI.
- One-shot mode runs all `1..5` in a single command.

## Startup Auto-Route Prompt

Wrapped interactive clients (`codex`, `claude`, `gemini`, and `opencode`) receive a conservative startup route prompt. It tells the agent to keep ordinary work on `single`, and only self-trigger AIOS commands when the task clearly needs another lane:

- `single`: continue in the active client.
- `subagent`: use staged orchestration or verification gates for one main domain.
- `team`: use the GroupChat Runtime — round-based parallel agents with shared conversation history and automatic re-plan.
- `harness`: use Solo Harness for explicit long-running, overnight, resumable, checkpoint-heavy objectives.

Controls:

```bash
export CTXDB_INTERACTIVE_AUTO_ROUTE=0      # disable the startup route prompt
export CTXDB_HARNESS_PROVIDER=codex       # codex|claude|gemini|opencode
export CTXDB_HARNESS_MAX_ITERATIONS=8     # injected harness loop budget
```

The injected `harness` command includes `--workspace <project-root>` so session artifacts are written into the active project, not the AIOS installation directory.

## Fail-Open Packing

If `contextdb context:pack` fails, `ctx-agent` will **warn and continue** by running the CLI without injected context.

To make packing failures fatal:

```bash
export CTXDB_PACK_STRICT=1
```

Shell wrappers (`codex`/`claude`/`gemini`) default to fail-open even if `CTXDB_PACK_STRICT=1` is set. To enforce strict packing for wrapped interactive runs too:

```bash
export CTXDB_PACK_STRICT_INTERACTIVE=1
```

## Manual Command Examples

```bash
cd mcp-server
npm run contextdb -- init
npm run contextdb -- session:new --agent codex-cli --project demo --goal "implement feature"
npm run contextdb -- event:add --session <id> --role user --kind prompt --text "start"
npm run contextdb -- checkpoint --session <id> --summary "phase done" --status running --next "write tests|implement"
npm run contextdb -- context:pack --session <id> --out memory/context-db/exports/<id>-context.md
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
npm run contextdb -- index:rebuild
```

## Workspace Memory (`aios memo`)

Use `aios memo` when you want durable operator memory without leaving the CLI flow.
Persona and user profile layers are global by design, so the agent can carry stable behavior and operator preferences across projects while project facts stay inside ContextDB.

Storage boundaries:

- `memo add/list/search` writes and reads memo events inside ContextDB session `workspace-memory--<space>`
- `memo recall` calls ContextDB `recall:sessions` for cross-session project recall
- `memo pin show/set/add` reads and writes `memory/context-db/sessions/workspace-memory--<space>/pinned.md`
- `memo persona ...` and `memo user ...` are global file layers (default: `~/.aios/SOUL.md` and `~/.aios/USER.md`)

Examples:

```bash
aios memo use release-train
aios memo add "Need strict pre-PR gate before merge #quality"
aios memo pin add "Never run destructive git commands without explicit approval."
aios memo list --limit 10
aios memo search "pre-PR" --limit 5
aios memo recall "release gate" --limit 5
aios memo persona init
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo user init
aios memo user add "Preferred language: zh-CN + technical English terms"
```

### Persona / User Profile Memory

Use this when you want a durable "personality and operating contract" that every wrapped coding agent can see without repeating it in each project prompt.

- `persona` stores the agent baseline: identity, tone, engineering standards, safety posture.
- `user` stores stable operator preferences: language, delivery style, recurring priorities.
- `ctx-agent` builds a Memory prelude in this order: persona, user profile, then workspace memo content.
- Persona/user files are scanned for unsafe prompt-injection-like content before write and before injection.
- Each identity file is capacity-limited to keep startup prompts bounded.

Commands:

```bash
aios memo persona init
aios memo persona set "Identity: pragmatic AI engineering partner"
aios memo persona add "Response style: concise, direct, evidence-first"
aios memo persona show
aios memo persona path

aios memo user init
aios memo user set "Preferred language: zh-CN + technical English terms"
aios memo user add "Delivery preference: implementation first, concise review second"
aios memo user show
aios memo user path
```

Configuration:

| Variable | Purpose | Default |
|---|---|---|
| `AIOS_IDENTITY_HOME` | Directory for global identity files | `~/.aios` |
| `AIOS_PERSONA_PATH` | Explicit persona file path | `~/.aios/SOUL.md` |
| `AIOS_USER_PROFILE_PATH` | Explicit user profile file path | `~/.aios/USER.md` |
| `AIOS_PERSONA_MAX_CHARS` | Persona capacity limit | `2400` |
| `AIOS_USER_PROFILE_MAX_CHARS` | User profile capacity limit | `2400` |

## Lazy Load Startup (P0) {#lazy-load}

ContextDB now supports **lazy load mode** for interactive CLI sessions. Instead of running a full `context:pack` on every startup (2–5 s), the wrapper loads a lightweight cached facade (< 50 ms) and lets the agent self-discover memory when needed.

### How it works

1. **Fast facade read** — On startup, load `memory/context-db/.facade.json` (cached session summary).
2. **Tiny prompt injection** — Inject a < 150-token facade prompt that tells the agent:
   - That ContextDB exists
   - Where to find the full history
   - When to load it
3. **Background bootstrap** — Fork a detached process to rebuild the full context pack asynchronously.
4. **Agentic triggers at runtime** — When the agent receives a user turn, it evaluates three signals (short-circuit):
   - **A. Intent detection** — Keywords like "remember", "之前", "continue", "resume"
   - **B. Task complexity** — Multi-step, cross-domain, orchestrate/team language
   - **C. RL policy gate** — Future integration with `rl-core` for learned load decisions

### Enabling / disabling

Lazy load is **on by default** for interactive sessions.

```bash
# Opt out (eager pack on every startup)
export CTXDB_LAZY_LOAD=0

# Explicitly opt in
export CTXDB_LAZY_LOAD=1
```

One-shot mode (`--prompt`) always uses the eager path regardless of this setting.

### Facade JSON

The facade sidecar is auto-generated after each successful pack:

```json
{
  "version": 1,
  "generatedAt": "2026-04-19T10:00:00Z",
  "ttlSeconds": 3600,
  "sessionId": "claude-code-20260419T095454-e6eb600d",
  "goal": "Shared context session for claude-code on aios",
  "status": "running",
  "lastCheckpointSummary": "...",
  "keyRefs": ["scripts/ctx-agent-core.mjs"],
  "contextPacketPath": "memory/context-db/exports/latest-claude-code-context.md",
  "hasStalePack": false
}
```

If the facade is missing or expired, it falls back to generating a fresh facade from the latest session headers.

## Token Compression Quick Start {#token-compression}

Use token compression when a session has useful history but the next CLI run should receive only a bounded context window. The `balanced` strategy keeps recent, error, file, command, and next-action signals first; compresses large or repetitive event text; then drops lower-priority events only if the budget still does not fit. Use `aggressive` for very small budgets and `legacy` when you need the old tail-only behavior.

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced \
  --out memory/context-db/exports/<id>-compressed.md
```

The generated packet reports an `Event Window` line with `tokenBudget`, `tokenUsed`, `rawTokenUsed`, `compressed`, `dropped`, and `truncated`, so you can verify whether compression saved tokens before events were removed.

## Packet Controls (P0)

`context:pack` supports token-aware compression plus filter-aware export:

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 60 \
  --token-budget 1200 \
  --token-strategy balanced \
  --kinds prompt,response,error \
  --refs core.ts,cli.ts
```

- `--token-budget`: cap recent-event payload by estimated token budget.
- `--token-strategy`: `legacy|balanced|aggressive` (default with budget: `balanced`; recommended unless you need strict backward behavior).
- `balanced`: compress repeated logs, long line sets, and stack traces while protecting the latest event and high-signal errors/files.
- `aggressive`: apply tighter line and length limits for small budgets where recall is more important than verbatim detail.
- `legacy`: keep the previous tail-window selection behavior and skip compression.
- `--kinds` / `--refs`: include only matching events.
- default dedupe is enabled for repeated events in the packet view.

## Retrieval Commands (P1)

ContextDB now provides SQLite-backed retrieval over sidecar indexes:

```bash
npm run contextdb -- search --query "auth race" --project demo --kinds response --refs auth.ts
npm run contextdb -- timeline --session <id> --limit 30
npm run contextdb -- event:get --id <sessionId>#<seq>
npm run contextdb -- index:sync --stats
npm run contextdb -- index:rebuild
```

- `search`: query indexed events.
- `timeline`: merged event/checkpoint feed.
- `event:get`: fetch a specific event by stable ID.
- `index:sync`: incremental sync from canonical session files to sidecar index.
- `index:rebuild`: rebuild SQLite sidecar from canonical session files.
- Default ranking path: SQLite FTS5 `MATCH` + `bm25(...)` over `kind/text/refs`.
- Backward compatibility: if FTS is unavailable, search automatically falls back to lexical matching.

## Incremental Sync + Refs Normalization (P1.5)

ContextDB now keeps a normalized `event_refs` table in SQLite.  
`--refs` filtering uses exact normalized ref matches through this table, reducing false positives from substring matching.

```bash
npm run contextdb -- index:sync --stats
npm run contextdb -- index:sync --force --stats
npm run contextdb -- index:sync --stats --jsonl-out memory/context-db/exports/index-sync-stats.jsonl
```

- `--stats`: prints `scanned/upserted` counters for sessions/events/checkpoints, elapsed time, throttle skips, and force flag.
- `--jsonl-out`: appends one JSON record per run (with timestamp) for trend analysis.
- Use `index:rebuild` only when sidecar is missing/corrupted or a full schema rebuild is required.

## Refs Query Benchmark

Use benchmark scripts to track refs-query latency and gate regressions:

```bash
cd mcp-server
npm run bench:contextdb:refs -- --events 2000 --refs-pool 200 --queries 300 --warmup 30 --json-out test-results/contextdb-refs-bench.local.json
npm run bench:contextdb:refs:ci
npm run bench:contextdb:refs:gate
```

- `bench:contextdb:refs`: local customizable dataset benchmark.
- `bench:contextdb:refs:ci`: standard CI dataset profile.
- `bench:contextdb:refs:gate`: fails when latency/hit-rate thresholds are not met.

## Optional Semantic Search (P2)

Semantic mode is optional and always falls back to lexical search when unavailable.

```bash
export CONTEXTDB_SEMANTIC=1
export CONTEXTDB_SEMANTIC_PROVIDER=token
npm run contextdb -- search --query "issue auth" --project demo --semantic
```

- `--semantic`: request semantic reranking.
- `CONTEXTDB_SEMANTIC_PROVIDER=token`: local token-overlap rerank, no network call.
- Unknown/disabled providers automatically fall back to lexical query path.
- Semantic rerank runs on query-scoped lexical candidates (not recency-only candidates), so older exact hits are not dropped by default.

## Storage Layout

ContextDB keeps canonical data in session files and uses sidecar indexes for speed:

```text
memory/context-db/
  sessions/<session_id>/*        # source of truth
  index/context.db               # sqlite sidecar (rebuildable)
  index/sessions.jsonl           # compatibility index
  index/events.jsonl             # compatibility index
  index/checkpoints.jsonl        # compatibility index
```

## Session ID Format

Session ids use this style:

`<agent>-<YYYYMMDDTHHMMSS>-<random>`

This keeps chronology obvious and avoids collisions.

## FAQ

### Is ContextDB a cloud database?

No. It uses local filesystem storage under the workspace.

### Why does context disappear after `/new` (Codex) or `/clear` (Claude/Gemini)?

Those commands reset the **in-CLI conversation state**. ContextDB is still on disk, but the wrapper only injects the context packet **when the CLI process starts**.

Recovery options:

- Preferred: exit the CLI and re-run `codex` / `claude` / `gemini` / `opencode` from your shell (wrapper runs `context:pack` again and re-injects).
- If you must stay in the same process: in the new conversation, ask the agent to read the latest snapshot:
  - `@memory/context-db/exports/latest-codex-cli-context.md`
  - `@memory/context-db/exports/latest-claude-code-context.md`
  - `@memory/context-db/exports/latest-gemini-cli-context.md`

If your client does not support `@file` mentions, paste the file contents as the first prompt.

### Do Codex, Claude, and Gemini share the same context?

Yes. If they run inside the same wrapped workspace (same git root when available, otherwise the same current directory), they use the same `memory/context-db/`.

### How do I hand off tasks across CLIs?

Keep one shared workspace session and use `context:pack` before the next CLI run.
