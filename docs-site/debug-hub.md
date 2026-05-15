---
title: debug-hub
description: Let your coding agents debug themselves — query logs, trace errors, and self-diagnose without your help.
---

# debug-hub

**What if your agent could read its own error logs and fix problems without you?**

debug-hub gives your agents the ability to search their own runtime logs, trace execution paths, and figure out what went wrong — all on their own.

[Read the Blog Post](/blog/2026-05-debug-hub-mcp/){ .md-button .md-button--primary }
[Get Started](#get-started){ .md-button }

## The Problem It Solves

Without debug-hub, debugging an agent looks like this:

1. You notice something is wrong
2. You scroll through terminal output (hundreds of lines)
3. You manually find the error and its context
4. You paste the relevant bits back to the agent
5. The agent finally understands what happened

**This doesn't work when you're not watching** — overnight runs, long harness jobs, multi-agent tasks.

With debug-hub, the agent does steps 2-4 itself.

## What You Get

| Feature | Description |
|---|---|
| **MCP Tools** | Your agent gets tools like `search_logs`, `get_trace`, `get_stats` |
| **Three SDKs** | Node.js, Browser, and Go — same API everywhere |
| **Zero dependencies** | Just files on disk under `~/.debug-hub/` — no database, no Docker |
| **Web UI** | Dark-themed dashboard with live log feed |

## Get Started

```bash
cd packages/debug-hub
npm install
npm run dev
```

This starts:

- **HTTP API + Web UI** at http://localhost:39200
- **MCP** via stdio (configure in your agent's MCP settings)

### Test It

Send a test log:

```bash
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "test-1",
    "timestamp": 1714500000000,
    "level": "info",
    "message": "hello from debug-hub",
    "source": {},
    "sdk": {"name": "test", "version": "0.3.0", "runtime": "node"}
  }'
```

Then open http://localhost:39200 to see it in the dashboard.

## Using The SDKs

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

## MCP Tools Reference

These tools are available to your agents through MCP:

| Tool | What it does |
|---|---|
| `search_logs` | Search logs by keyword, level, time range |
| `get_trace` | Get the full trace tree for a specific execution |
| `list_traces` | List recent execution traces |
| `get_stats` | See aggregate counts and error summaries |
| `start_session` | Start a debugging session with an objective |
| `record_event` | Attach structured evidence to a session |
| `timeline` | Get a chronological evidence stream |
| `compact_context` | Build a bounded context pack for agent resume |
| `instrument` | Record which files have debug instrumentation |
| `cleanup_instruments` | Remove injected debug code after fixing |
| `clear_logs` | Clean up old logs |
| `health` | Check if debug-hub is healthy |

### How Agents Debug Themselves

An agent that hits an error can now:

1. Call `search_logs` with `{ level: "error", since: <5 minutes ago> }`
2. Find the exact error messages and their trace IDs
3. Call `get_trace` to see the full execution path
4. Figure out which step failed
5. Fix the problem — without waking you up

### Instrumentation Workflow

For deeper debugging, agents can inject temporary debug code and clean it up after:

1. Start a session: `debug_hub.start_session { objective: "debug payment timeout" }`
2. Inject a reporter at the top of the file being debugged
3. Tag debug calls with the session ID
4. Record which files were instrumented
5. Reproduce the issue and analyze logs
6. Clean up all injected code: `debug_hub.cleanup_instruments`

## Real-World Use Cases

### Self-Diagnosing Error Loops

An agent stuck in a retry loop can query its own error logs, identify the pattern, and adjust its strategy — all without human intervention.

### Overnight Run Monitoring

Harness runs can log structured traces. If something goes wrong overnight, the next morning's diagnostic agent can pull the exact failure point.

### Multi-Agent Tracing

In Agent Team workflows, traces can be correlated across agent boundaries for a unified view of what happened.

## Where To Go Next

- [Solo Harness](solo-harness.md) — long-running agent work with journaling
- [Agent Team](team-ops.md) — multi-agent collaboration
- [Troubleshooting](troubleshooting.md) — general debugging tips
- [Blog: debug-hub Deep Dive](/blog/2026-05-debug-hub-mcp/) — full announcement post
