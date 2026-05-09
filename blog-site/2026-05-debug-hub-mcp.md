---
title: "debug-hub: An MCP-Native Debug Service That Lets Coding Agents Debug Themselves"
description: "Introducing debug-hub 0.1.0 — a lightweight MCP-native debug log service purpose-built for coding agents, with Node.js / Browser / Go SDKs, embedded Web UI, and file-based storage that agents can grep directly."
date: 2026-05-06
tags: ["debug-hub", "MCP", "Coding Agent", "Observability", "Node.js", "Go", "AIOS"]
---

# debug-hub: An MCP-Native Debug Service That Lets Coding Agents Debug Themselves

Every coding agent generates logs. But when things go wrong, the agent itself has no way to inspect those logs — it can't `grep` your terminal output, parse JSONL traces, or correlate errors across spans. You, the human, have to stop what you're doing and play detective.

**debug-hub** changes that. It's a debug log collection service built from the ground up for coding agents — exposing logs and traces as MCP tools the agent can query directly.

## The Problem: Agents Are Blind to Their Own Runtime

When a coding agent hits an error loop, stalls on a decision, or produces unexpected output, the debugging workflow is always human-first:

1. You notice something is wrong
2. You scroll through terminal history or open log files
3. You manually correlate timestamps, error messages, and spans
4. You paste the relevant bits back into the agent's context
5. The agent finally gets enough signal to recover

This works for short sessions. It breaks down for long-running harness jobs, overnight runs, and multi-agent orchestrations where no human is watching.

The core insight: **agents should be able to introspect their own execution traces**. They already have tool access (MCP). They already reason about errors. They just need a queryable surface for their own runtime state.

## What debug-hub Ships

debug-hub is a single Node.js binary that packs four things into one process:

| Component | Role |
|-----------|------|
| **HTTP API** | Receives logs from SDKs, serves search/stats endpoints |
| **MCP Server** | Exposes 14 tools (`list_traces`, `get_trace`, `search_logs`, `get_stats`, `clear_logs`, `start_session`, `record_event`, `get_session`, `timeline`, `health`, `compact_context`, `instrument`, `list_instruments`, `cleanup_instruments`) for coding agents |
| **Embedded Web UI** | Dark-themed dashboard with log search, trace viewer, SSE live feed |
| **File Storage** | JSONL files under `~/.debug-hub/` — directly readable by `cat`/`grep` |

### SDK Support

Three SDKs, one consistent API pattern:

**Node.js**
```typescript
import { DebugHub } from '@debug-hub/node';

const debug = new DebugHub({ service: 'my-agent' });
debug.info('Tool call started', { tool: 'search', args: { query: '...' } });

const trace = debug.startTrace('agent-turn');
const span = trace.span('llm-call');
span.info('Prompt sent', { model: 'claude-opus-4-7' });
span.end();
trace.end();
```

**Browser**
```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

**Go**
```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

### MCP Tools for Agents

Add debug-hub to your agent's MCP config, and it gains 5 new tools:

```
debug_hub.list_traces   — List recent execution traces
debug_hub.get_trace     — Get full span tree for a specific trace
debug_hub.search_logs   — Search by keyword, level, time range, module, or traceId
debug_hub.get_stats     — Aggregate counts, error summary, level breakdown
debug_hub.clear_logs    — Clean up old logs
```

An agent hitting a repeated error can now:

1. Call `search_logs` with `{ level: "error", since: <5 minutes ago> }`
2. Get back the exact error messages and their trace IDs
3. Call `get_trace` on the relevant trace to see the full span tree
4. Self-diagnose which step in its pipeline is failing
5. Self-correct without human intervention

## Architecture Decisions Worth Noting

**No database dependency.** Storage is JSONL files on disk under `~/.debug-hub/`. This means:
- Zero setup beyond `npm install`
- Agents can bypass the API and read files directly with `cat`/`grep`
- No daemon, no Docker, no connection strings

**MCP-first, HTTP-second.** The MCP tool definitions aren't an afterthought bolted onto an HTTP API — they share the same storage layer and are co-designed. The HTTP API exists for SDK ingestion and the Web UI; the MCP surface is what agents actually use to query.

**SSE for the dashboard.** New log entries are broadcast to the Web UI via Server-Sent Events — no WebSocket complexity, no polling overhead.

## Quick Start

```bash
cd packages/debug-hub
npm install
npm run dev
# HTTP API + Web UI: http://localhost:39200
# MCP: stdio mode (configure in your agent's MCP settings)
```

Send a test log:
```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello from debug-hub","source":{},"trace":{"traceId":"t1","spanId":"s1"},"sdk":{"name":"test","version":"0.1.0","runtime":"node"}}'
```

Then open `http://localhost:39200` to see it in the dashboard.

## What Shipped Since 0.1.0

**v0.2 (2026-05-09):** Automatic trace materialization (debounced), agent debugging sessions (`start_session`, `record_event`, `get_session`), structured evidence events (hypotheses, tool calls, verification), compact timeline and context packs for agent handoff, `/api/health` endpoint, input validation, path-traversal hardening.

**v0.3 (2026-05-09):** Instrumentation tracking and automatic cleanup. New MCP tools: `instrument`, `list_instruments`, `cleanup_instruments`. Marker convention `DH:<sessionId>` for zero-dependency debug code injection — agents inject a single-line `__dh` reporter, tag every debug call with the session marker, and `cleanup_instruments` strips all injected code when the bug is fixed. Dual-mode cleanup (explicit via instrument records, discovery via workspace grep) with `dryRun` preview.

## Roadmap

- **Python SDK** — for the broader AI/ML agent ecosystem
- **Trace-aware compaction** — summarize long traces for context-window efficiency
- **Multi-agent correlation** — cross-agent trace linking for orchestrator/worker patterns
- **Persistent alert rules** — agent-configurable watch conditions that fire on log patterns

## Try It

debug-hub is part of the [rex-ai-boot](https://github.com/rexleimo/rex-cli) monorepo at `packages/debug-hub`. It requires Node.js ≥ 22.

If you're building coding agents, harness runners, or MCP servers — give your agents the ability to debug themselves.
