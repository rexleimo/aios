---
title: debug-hub
description: MCP-native debug log service that lets coding agents query their own runtime logs and self-diagnose errors.
---

# debug-hub

> Let coding agents debug themselves.

debug-hub is an MCP-native debug log service purpose-built for coding agents. It exposes logs and traces as MCP tools your agents can query directly — so they can `search_logs`, `get_trace`, and `get_stats` without you grepping terminal output.

[Read the Blog Post](/blog/2026-05-debug-hub-mcp/){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="blog_post" }
[Quick Start](#quick-start){ .md-button data-rex-track="cta_click" data-rex-location="debug_hub_hero" data-rex-target="quick_start" }

---

## Why debug-hub

When a coding agent hits an error loop, stalls on a decision, or produces unexpected output, the debugging workflow is always **human-first**:

1. You notice something is wrong
2. You scroll through terminal history or open log files
3. You manually correlate timestamps, error messages, and spans
4. You paste the relevant bits back into the agent's context
5. The agent finally gets enough signal to recover

This breaks down for long-running harness jobs, overnight runs, and multi-agent orchestrations where no human is watching.

**The core insight**: agents should be able to introspect their own execution traces. They already have tool access (MCP). They just need a queryable surface for their own runtime state.

---

## Core Features

<div class="feature-grid">
  <div class="feature-card feature-card--debug">
    <div class="feature-card__icon">🔧</div>
    <div class="feature-card__title">MCP Tools for Agents</div>
    <div class="feature-card__desc">
      Trace/log tools plus <code>start_session</code>, <code>record_event</code>, <code>instrument</code>, <code>cleanup_instruments</code>, and more — agents can query runtime evidence, inject debug code, and auto-cleanup after fixing bugs.
    </div>
  </div>
  <div class="feature-card feature-card--tool">
    <div class="feature-card__icon">📦</div>
    <div class="feature-card__title">Three SDKs</div>
    <div class="feature-card__desc">
      Node.js, Browser, and Go — one consistent API pattern across all runtimes.
    </div>
  </div>
  <div class="feature-card feature-card--memory">
    <div class="feature-card__icon">📁</div>
    <div class="feature-card__title">Zero Dependencies</div>
    <div class="feature-card__desc">
      File-based JSONL storage under <code>~/.debug-hub/</code> — directly readable by <code>cat</code>/<code>grep</code>.
    </div>
  </div>
  <div class="feature-card feature-card--workflow">
    <div class="feature-card__icon">🖥️</div>
    <div class="feature-card__title">Embedded Web UI</div>
    <div class="feature-card__desc">
      Dark-themed dashboard with log search, trace viewer, and SSE live feed.
    </div>
  </div>
</div>

---

## Quick Start

```bash
cd packages/debug-hub
npm install
npm run dev
```

- **HTTP API + Web UI**: http://localhost:39200
- **MCP**: stdio mode (configure in your agent's MCP settings)

### Send a Test Log

```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "1",
    "timestamp": 1714500000000,
    "level": "info",
    "message": "hello from debug-hub",
    "source": {},
    "trace": {"traceId": "t1", "spanId": "s1"},
    "sdk": {"name": "test", "version": "0.3.0", "runtime": "node"}
  }'
```

The `trace` field is optional — omit it for logs that don't need tracing. Invalid entries in batch POST get skipped (response includes `written`/`skipped` counts); single-entry POST returns HTTP 400 on malformed payloads.

Then open `http://localhost:39200` to see it in the dashboard.

---

## SDK Usage

### Node.js

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

### Browser

```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'web-ui' });
debug.warn('API latency spike', { endpoint: '/api/chat', p99: 3200 });
```

### Go

```go
debug := debughub.New(debughub.Config{Service: "harness-runner"})
trace := debug.StartTrace("iteration-42")
span := trace.Span("checkpoint-write")
span.Info("Checkpoint saved", map[string]interface{}{"bytes": 12400})
span.End()
trace.End()
```

---

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `debug_hub.list_traces` | List recent execution traces with filters |
| `debug_hub.get_trace` | Get full span tree for a specific trace |
| `debug_hub.search_logs` | Case-insensitive search by keyword, level, time range, module, or traceId |
| `debug_hub.get_stats` | Aggregate counts, error summary, level breakdown |
| `debug_hub.clear_logs` | Clean up old logs with retention rules |
| `debug_hub.start_session` | Create an agent debugging session with objective/workspace metadata |
| `debug_hub.record_event` | Attach structured evidence (level defaults to `info`, kind defaults to `note` if invalid) |
| `debug_hub.get_session` | Read a session with its recorded evidence |
| `debug_hub.timeline` | Return a compact chronological evidence stream |
| `debug_hub.health` | Report ingest/storage health and schema version |
| `debug_hub.compact_context` | Build a bounded handoff context pack for agent resume |
| `debug_hub.instrument` | Record files instrumented with debug logs for a session |
| `debug_hub.list_instruments` | List recorded instrumentations, optionally filtered by session |
| `debug_hub.cleanup_instruments` | Remove debug log lines tagged with `DH:<sessionId>` (supports `dryRun`) |

### Debug Instrumentation Flow

Agent debugging a project can inject zero-dependency instrumentation and clean up after:

1. **Start session**: `debug_hub.start_session { objective: "debug payment timeout" }`
2. **Inject reporter** at the top of the first modified file:
   ```js
   const __dh=async(m,d)=>{try{await fetch('http://127.0.0.1:39200/api/logs/single',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),timestamp:Date.now(),level:'debug',message:m,data:d,sdk:{name:'dh',version:'1',runtime:'node'}})})}catch{}}
   ```
3. **Tag debug calls** with `DH:<sessionId>`:
   ```js
   __dh('DH:sess-abc user state', {user});
   ```
4. **Record instrumentation**: `debug_hub.instrument { sessionId, files: [{path, lineCount}] }`
5. **Reproduce & analyze**: `debug_hub.search_logs { keyword: "sess-abc" }`
6. **Cleanup after fix**: `debug_hub.cleanup_instruments { sessionId }`

### Self-Diagnosis Example

An agent hitting a repeated error can now:

1. Call `search_logs` with `{ level: "error", since: <5 minutes ago> }`
2. Get back the exact error messages and their trace IDs
3. Call `get_trace` on the relevant trace to see the full span tree
4. Self-diagnose which step in its pipeline is failing
5. Self-correct without human intervention

---

## Architecture

debug-hub is a single Node.js binary that packs four components:

| Component | Role |
|-----------|------|
| **HTTP API** | Receives logs from SDKs, serves search/stats endpoints |
| **MCP Server** | Exposes log/trace tools plus session, event, health, timeline, and compact context tools for coding agents |
| **Embedded Web UI** | Dark-themed dashboard with log search, trace viewer, SSE live feed |
| **File Storage** | JSONL files under `~/.debug-hub/` — directly readable |

### Design Decisions

**No database dependency.** Storage is JSONL files on disk. This means:
- Zero setup beyond `npm install`
- Agents can bypass the API and read files directly
- No daemon, no Docker, no connection strings

**MCP-first, HTTP-second.** The MCP tool definitions share the same storage layer and are co-designed with the HTTP API.

**SSE for the dashboard.** New log entries broadcast via Server-Sent Events — no WebSocket complexity, no polling overhead.

---

## Use Cases

### Self-Diagnosing Error Loops

When an agent gets stuck in a retry loop, it can query its own recent error logs, identify the pattern, and adjust its strategy — all without waking you up.

### Long-Running Task Monitoring

Overnight harness runs, data processing jobs, or training pipelines can log structured traces. If something goes wrong, the next morning's diagnostic agent can pull the exact failure point from the trace history.

### Multi-Agent Execution Tracing

Distributed orchestrator/worker patterns can correlate traces across agent boundaries, giving you a unified view of complex multi-step workflows.

---

## What's Next

debug-hub is at 0.3.0. v0.3 adds instrumentation tracking and automatic cleanup: agents inject zero-dependency debug code with session-scoped markers, debug-hub tracks which files were modified, and `cleanup_instruments` strips all injected code when the bug is fixed. The roadmap includes:

- **Python SDK** — for the broader AI/ML agent ecosystem
- **Multi-agent correlation** — cross-agent trace linking for orchestrator/worker patterns
- **Persistent alert rules** — agent-configurable watch conditions that fire on log patterns
- **Go SDK** — for Go-based agent runtimes

---

## Resources

- **Deep Dive Blog**: [debug-hub: MCP-Native Debug Log Service](/blog/2026-05-debug-hub-mcp/)
- **Source Code**: `packages/debug-hub` in the rex-ai-boot monorepo
- **Requirements**: Node.js ≥ 22

---

## Related Features

- [Solo Harness](solo-harness.md) — Long-running single-agent work with journaling
- [Agent Team](team-ops.md) — Multi-agent collaboration and coordination
- [Troubleshooting](troubleshooting.md) — General debugging and diagnostics
