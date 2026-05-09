# debug-hub

Debug log and structured evidence collection service for coding agents.

## Quick Start

```bash
cd packages/debug-hub
npm install
npm run dev
```

Server starts at `http://localhost:39200` (Web UI) with MCP stdio mode.

## Usage

### As MCP Server (for coding agents)

Add to your MCP server config:

```json
{
  "debug-hub": {
    "command": "node",
    "args": ["packages/debug-hub/dist/cli.js"]
  }
}
```

Available MCP tools:
- `debug_hub.list_traces` — List recent traces
- `debug_hub.get_trace` — Get trace details
- `debug_hub.search_logs` — Search logs
- `debug_hub.get_stats` — Get statistics
- `debug_hub.clear_logs` — Clear logs
- `debug_hub.start_session` — Create an agent debugging session
- `debug_hub.record_event` — Attach structured evidence to a session
- `debug_hub.get_session` — Read a session with its recorded evidence
- `debug_hub.timeline` — Return a compact chronological evidence stream
- `debug_hub.health` — Report ingest/storage health and schema version
- `debug_hub.compact_context` — Build a bounded handoff context pack

### Agent Debugging Sessions

```json
{
  "tool": "debug_hub.start_session",
  "arguments": {
    "sessionId": "checkout-debug",
    "objective": "Find why checkout retries never recover",
    "workspace": "/repo/app",
    "agent": "codex-cli"
  }
}
```

Agents can then record hypotheses, tool calls, reproduction runs, artifacts, and verification notes with `debug_hub.record_event`. Logs remain available as JSONL, but v0.2 also keeps session/event indexes so an agent can query a timeline or compact handoff pack without reading raw noisy logs.

### HTTP API

```bash
# Report a log
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello","source":{},"trace":{"traceId":"t1","spanId":"s1"},"sdk":{"name":"test","version":"1.0","runtime":"node"}}'

# Get stats
curl http://localhost:39200/api/stats

# Get storage health
curl http://localhost:39200/api/health

# Search logs
curl 'http://localhost:39200/api/logs/search?level=error'
```

### Node.js SDK

```typescript
import { DebugHub } from '@debug-hub/node';

const debug = new DebugHub({ service: 'my-app' });
debug.info('Hello world', { key: 'value' });

const trace = debug.startTrace('my operation');
const span = trace.span('step 1');
span.info('doing work');
span.end();
trace.end();
```

### Browser SDK

```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({ service: 'my-webapp' });
debug.info('Page loaded', { path: '/' });
```

### Go SDK

```go
debug := debughub.New(debughub.Config{Service: "my-go-app"})
debug.Info("Hello", map[string]interface{}{"key": "value"})

trace := debug.StartTrace("operation")
span := trace.Span("step1")
span.Info("working")
span.End()
trace.End()
```

## Storage

Logs, traces, sessions, and events are stored in `~/.debug-hub/` as JSON files:

```
~/.debug-hub/
├── logs/2026-04-30.jsonl       # Daily log stream
├── traces/{traceId}.json       # Derived trace files
├── sessions/{sessionId}.json   # Agent debugging sessions
└── events/2026-04-30.jsonl     # Structured evidence events
```

Agents can directly read these files with `cat` or `grep`. When logs share a `traceId`, debug-hub automatically materializes `traces/{traceId}.json` so `debug_hub.get_trace` works even if callers only reported log entries.
