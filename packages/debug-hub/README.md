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
- `debug_hub.instrument` — Record files instrumented with debug logs for a session
- `debug_hub.list_instruments` — List recorded instrumentations, optionally filtered by session
- `debug_hub.cleanup_instruments` — Remove debug log lines tagged with `DH:<sessionId>` marker

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

**v0.3.0** introduces instrumentation tracking and automatic cleanup:

```json
{
  "tool": "debug_hub.instrument",
  "arguments": {
    "sessionId": "checkout-debug",
    "files": [
      { "path": "/repo/src/checkout.ts", "lineCount": 3 },
      { "path": "/repo/src/payment.ts", "lineCount": 2 }
    ]
  }
}
```

After fixing the bug, call `debug_hub.cleanup_instruments` to strip all injected debug lines. Use `dryRun: true` first to preview. If the agent forgot to call `instrument`, pass `workspace` for grep-based discovery.

### Instrumentation Protocol

When injecting debug logs into a target project, use this zero-dependency reporter:

```js
const __dh=async(m,d)=>{try{await fetch('http://127.0.0.1:39200/api/logs/single',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),timestamp:Date.now(),level:'debug',message:m,data:d,sdk:{name:'dh',version:'1',runtime:'node'}})})}catch{}}

// Tag every debug call with DH:<sessionId>
__dh('DH:sess-abc user state', {user});
```

Cleanup strips all lines containing `DH:<sessionId>` — the `__dh` helper and every call site.

Invalid entries in batch POST /api/logs are skipped (response includes `written` and `skipped` counts). Single-entry POST /api/logs/single returns HTTP 400 for malformed payloads.

Programmatic consumers can call `storage.flushPendingTraces()` to force immediate trace materialization (normally debounced at 200ms). The `ApiServer` interface also exposes its `.storage` property for test access.

### HTTP API

```bash
# Report a log (trace is optional)
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello","source":{},"trace":{"traceId":"t1","spanId":"s1"},"sdk":{"name":"test","version":"1.0","runtime":"node"}}'

# Minimal log without trace
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"2","timestamp":1714500000001,"level":"warn","message":"no trace needed","source":{},"sdk":{"name":"test","version":"1.0","runtime":"node"}}'

# Batch send
curl -X POST http://localhost:39200/api/logs \
  -H 'Content-Type: application/json' \
  -d '[{"id":"3","timestamp":1714500000002,"level":"info","message":"batch1","source":{},"sdk":{"name":"test","version":"1.0","runtime":"node"}},{"id":"4","timestamp":1714500000003,"level":"info","message":"batch2","source":{},"sdk":{"name":"test","version":"1.0","runtime":"node"}}]'

# Get stats
curl http://localhost:39200/api/stats

# Get storage health
curl http://localhost:39200/api/health

# Search logs (keyword matching is case-insensitive)
curl 'http://localhost:39200/api/logs/search?level=error&keyword=timeout'
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

Logs, traces, sessions, events, and instruments are stored in `~/.debug-hub/` as JSON files:

```
~/.debug-hub/
├── logs/2026-04-30.jsonl       # Daily log stream
├── traces/{traceId}.json       # Derived trace files
├── sessions/{sessionId}.json   # Agent debugging sessions
├── events/2026-04-30.jsonl     # Structured evidence events
└── instruments/{sessionId}.json # Instrumentation records
```

Agents can directly read these files with `cat` or `grep`. When logs share a `traceId`, debug-hub automatically materializes `traces/{traceId}.json` so `debug_hub.get_trace` works even if callers only reported log entries.
