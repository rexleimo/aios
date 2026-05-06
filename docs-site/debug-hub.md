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
      <code>list_traces</code>, <code>get_trace</code>, <code>search_logs</code>, <code>get_stats</code>, <code>clear_logs</code> — 5 tools that let agents query their own runtime.
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
    "sdk": {"name": "test", "version": "0.1.0", "runtime": "node"}
  }'
```

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
| `debug_hub.search_logs` | Search by keyword, level, time range, module, or traceId |
| `debug_hub.get_stats` | Aggregate counts, error summary, level breakdown |
| `debug_hub.clear_logs` | Clean up old logs with retention rules |

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
| **MCP Server** | Exposes 5 query tools for coding agents |
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

debug-hub is at 0.1.0. The roadmap includes:

- **Python SDK** — for the broader AI/ML agent ecosystem
- **Trace-aware compaction** — summarize long traces for context-window efficiency
- **Multi-agent correlation** — cross-agent trace linking for orchestrator/worker patterns
- **Persistent alert rules** — agent-configurable watch conditions that fire on log patterns

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
