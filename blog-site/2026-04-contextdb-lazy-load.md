---
title: "ContextDB Lazy Load: From 5-Second Startup to Agentic Self-Discovery"
description: "We replaced eager context injection with a <50 ms facade path, background async bootstrap, and runtime trigger orchestration — so the agent decides when to load memory."
date: 2026-04-19
tags: [ContextDB, Lazy Load, Agentic Memory, AIOS, Performance]
---

# ContextDB Lazy Load: From 5-Second Startup to Agentic Self-Discovery

Every time you opened an AIOS-wrapped CLI, ContextDB ran a full `init → session → pack → inject` pipeline. That was 2–5 seconds of waiting before you could type a single character. For users who just wanted a quick chat or a one-line fix, this felt like unnecessary friction.

Today we shipped a **lazy load path** that cuts startup to < 50 ms while keeping full memory capability available on demand.

## The Problem

- **Slow cold start** — `context:pack` rebuilds the full session markdown on every CLI invocation.
- **Cognitive noise** — A large context packet is injected even when the user only wants a simple task.
- **Forced continuity** — Every session was treated as a continuation of the previous one, even when irrelevant.

## The Solution: Three Layers

### Layer 1 — Facade Prompt at Startup (< 50 ms)

Instead of packing the entire history, we load a lightweight `memory/context-db/.facade.json` sidecar:

```json
{
  "sessionId": "claude-code-20260419T095454-e6eb600d",
  "goal": "Shared context session for claude-code on aios",
  "status": "running",
  "lastCheckpointSummary": "Browser MCP weak-model remediation complete",
  "keyRefs": ["scripts/ctx-agent-core.mjs"],
  "contextPacketPath": "memory/context-db/exports/latest-claude-code-context.md"
}
```

This becomes a < 150-token prompt injected via `--append-system-prompt`:

> "This project uses ContextDB for session memory. Latest session: ... Full history at: ... Load it when you need prior context."

### Layer 2 — Background Async Bootstrap

While you start typing, a detached process rebuilds the full context pack in the background:

```
Startup ──► Load facade (20 ms)
        ──► Inject prompt + launch CLI
        ──► [background] contextdb init → pack → update facade
```

The next time you open the CLI, the facade is fresh and the cycle repeats.

### Layer 3 — Runtime Trigger Orchestration (A → B → C)

When the agent receives a user turn, it evaluates three signals in short-circuit order:

| Signal | What it checks | Example triggers |
|--------|---------------|------------------|
| **A. Intent** | Memory-related keywords | "remember", "之前", "continue", "resume" |
| **B. Complexity** | Task structure indicators | "first do X then Y", "orchestrate a team" |
| **C. RL Policy** | Learned load decision | Future: `rl-core` policy model |

If any signal fires, the agent reads the full history via `@file` or tool-use — **no wrapper involvement required**.

## Architecture

```
┌──────────────────────────────────────┐
│  Startup (< 50 ms)                    │
│  1. Load .facade.json                 │
│  2. Inject facade prompt              │
│  3. Launch CLI                        │
│  4. [bg] Async bootstrap              │
└──────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│  Runtime (agent turn)                 │
│  User Input → Intent → Complexity → RL│
│  Any true → Agent loads @file history │
└──────────────────────────────────────┘
```

## Key Design Decisions

- **Default on** — `CTXDB_LAZY_LOAD` defaults to `1`. Set `CTXDB_LAZY_LOAD=0` to restore eager packing.
- **One-shot preserved** — `--prompt` mode always uses the full eager path (the agent needs context immediately).
- **Fail-open** — If facade is missing/expired, generate from session headers on-the-fly. If async bootstrap fails, log a warning and continue.
- **No dynamic injection** — Current CLI architectures fix system prompt at spawn time, so we shift the loading responsibility to the agent itself.

## What Changed

| File | What it does |
|------|-------------|
| `scripts/lib/contextdb/facade.mjs` | Load facade JSON, validate TTL, fallback generation |
| `scripts/lib/contextdb/async-bootstrap.mjs` | Fire-and-forget pack + facade update |
| `scripts/lib/contextdb/async-bootstrap-runner.mjs` | Standalone CLI runner for detached background process |
| `scripts/lib/contextdb/trigger/intent.mjs` | Regex/keyword intent detection |
| `scripts/lib/contextdb/trigger/complexity.mjs` | Heuristic task complexity scoring |
| `scripts/lib/contextdb/trigger/orchestrator.mjs` | A→B→C short-circuit trigger evaluation |
| `scripts/ctx-agent-core.mjs` | Lazy load branch in `runCtxAgent` |

## Verification

### New tests
- `contextdb-facade.test.mjs` — 4 tests (hit, miss, expired, generate fallback)
- `trigger-intent.test.mjs` — 6 tests (recall, continuation, reference, meta, neutral, negative)
- `trigger-complexity.test.mjs` — 4 tests (multi-step, cross-domain, orchestrate, simple)
- `trigger-orchestrator.test.mjs` — 4 tests (intent fires, negative suppresses, complexity fires, no trigger)
- `async-bootstrap.test.mjs` — 1 test (writes facade after pack)
- `contextdb-lazy-load.test.mjs` — 5 tests (helpers, integration)

### Regression
- `ctx-agent-core.test.mjs` — 24 existing tests, all pass with `CTXDB_LAZY_LOAD=0` opt-out

## What’s Next

1. **RL policy integration** — Train a `rl-core` policy to optimize "load memory?" decisions with real reward signals.
2. **Telemetry** — Track trigger accuracy, load latency, and task completion benefit to continuously improve thresholds.
3. **Model-tier presets** — Different trigger sensitivity for weak vs. strong models.

---

**Try it:** Open any AIOS-wrapped CLI in a project with session history. You should see `Context packet: (lazy-load; agent self-discovers memory)` instead of the usual pack path. Ask the agent to "continue from last time" and watch it load the history on demand.

## Related

- [ContextDB](https://cli.rexai.top/contextdb/)
- [Quick Start](https://cli.rexai.top/getting-started/) — install AIOS in 30 seconds
- [Workflow Policy](https://cli.rexai.top/workflow-policy/) — direct / guarded / planned routes
