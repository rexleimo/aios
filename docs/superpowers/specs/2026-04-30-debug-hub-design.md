# debug-hub: Debug Log Collection Service

## Overview

debug-hub is a local debug log collection service designed for coding agents. It provides structured log reporting with trace/span-based call chain tracking, an embedded Web UI for visualization, and MCP tools for agents to query and analyze logs.

**Target users**: Coding agents (Claude, etc.) and developers during development/debugging.

## Architecture

Single-process monolithic architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    debug-hub server                      │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ HTTP API │  │MCP Tools │  │ Web UI   │  │ Storage │ │
│  │ (接收)   │  │ (查询)   │  │ (展示)   │  │ (JSON)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
│       └──────────────┴──────────────┴──────────────┘      │
│                          │                                │
│                    ┌─────┴─────┐                          │
│                    │  事件总线  │                          │
│                    └───────────┘                          │
└─────────────────────────────────────────────────────────┘
         ▲                                    │
         │ SDK 上报                           │ MCP 协议
         │                                    ▼
    ┌────┴────┐                        ┌──────────────┐
    │  SDK    │                        │ Coding Agent │
    │ (JS/Go) │                        │ (Claude等)   │
    └─────────┘                        └──────────────┘
```

## Project Structure

```
packages/debug-hub/
├── src/
│   ├── server/              # MCP server + HTTP API
│   │   ├── index.ts         # Entry point
│   │   ├── mcp.ts           # MCP tool definitions
│   │   ├── api.ts           # HTTP API routes
│   │   ├── storage.ts       # JSON file storage engine
│   │   └── events.ts        # In-process event bus
│   ├── ui/                  # Embedded Web UI (single HTML)
│   │   └── index.html
│   └── types.ts             # Shared type definitions
├── sdk/
│   ├── node/                # Node.js SDK (TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts    # HTTP client
│   │   │   ├── trace.ts     # Trace/Span API
│   │   │   └── types.ts
│   │   └── package.json
│   ├── browser/             # Browser SDK (TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   └── package.json
│   └── go/                  # Go SDK
│       ├── debughub.go
│       ├── trace.go
│       └── go.mod
├── package.json
├── tsconfig.json
└── README.md
```

## Data Model

### LogEntry

```typescript
interface LogEntry {
  id: string;              // UUID
  timestamp: number;       // Unix ms
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;

  // Source info
  source: {
    file?: string;
    line?: number;
    function?: string;
    module?: string;
  };

  // Trace context
  trace: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
  };

  // Extensions
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };

  // SDK metadata
  sdk: {
    name: string;
    version: string;
    runtime: 'node' | 'browser' | 'go';
  };
}
```

### Trace

```typescript
interface Trace {
  traceId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  spanCount: number;
  errorCount: number;
  rootSpan: SpanSummary;
  tags?: Record<string, string>;
}

interface SpanSummary {
  spanId: string;
  message: string;
  level: string;
  duration?: number;
  children?: SpanSummary[];
}
```

## Storage

JSON/JSONL file-based storage in `~/.debug-hub/`:

```
~/.debug-hub/
├── traces/
│   ├── {traceId}.json       # Complete trace with all spans
├── logs/
│   ├── 2026-04-30.jsonl     # Daily log stream (append-only)
├── index.json               # Lightweight index (trace list, stats)
└── config.json
```

**Why JSON files over SQLite**:
- Agents can directly `cat`/`grep` files without SQL tooling
- Human-readable with any text editor
- JSONL supports efficient append writes
- Trace files are self-contained

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/logs` | Batch log reporting |
| POST | `/api/logs/single` | Single log report |
| GET | `/api/traces` | List traces |
| GET | `/api/traces/:id` | Get trace details |
| GET | `/api/logs/search` | Search logs |
| GET | `/api/stats` | Get statistics |
| DELETE | `/api/logs` | Clear logs |
| GET | `/api/events` | SSE real-time log stream |

Default port: `39200`

## MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `debug_hub.list_traces` | List recent traces | `limit?`, `since?` |
| `debug_hub.get_trace` | Get full trace chain | `traceId` |
| `debug_hub.search_logs` | Search logs | `keyword?`, `level?`, `since?`, `module?` |
| `debug_hub.get_stats` | Get statistics | - |
| `debug_hub.clear_logs` | Clear logs | `olderThan?` |

## SDK Design

### Node.js SDK

```typescript
import { DebugHub } from '@debug-hub/node';

const debug = new DebugHub({ service: 'my-app' });

// Basic logging
debug.info('用户登录成功', { userId: '123' });
debug.error('数据库连接失败', { host: 'localhost' });

// Trace
const trace = debug.startTrace('处理订单');
const span1 = trace.span('验证库存');
span1.info('库存充足');
span1.end();

const span2 = trace.span('扣款');
span2.error('支付超时', { timeout: 30000 });
span2.end();

trace.end();
```

### Browser SDK

```typescript
import { DebugHub } from '@debug-hub/browser';

const debug = new DebugHub({
  service: 'my-webapp',
  endpoint: 'http://localhost:39200'
});

debug.info('页面加载完成', { path: '/dashboard' });
```

### Go SDK

```go
import "github.com/rex/debug-hub/sdk/go/debughub"

debug := debughub.New(debughub.Config{
    Service:  "my-go-service",
    Endpoint: "http://localhost:39200",
})

debug.Info("服务启动", map[string]interface{}{"port": 8080})

trace := debug.StartTrace("处理请求")
span := trace.Span("查询数据库")
span.Info("查询完成")
span.End()
trace.End()
```

## Web UI

Embedded single-page application at `http://localhost:39200`:

- **Trace List**: Recent traces with status, duration, error count
- **Trace Detail**: Tree view of span call chain, expandable per span
- **Log Search**: Search by keyword/level/time range, real-time tail
- **Stats Panel**: Error rate, log volume trend, active services

Tech: Single HTML file with vanilla JS (zero dependencies, embedded in server binary)

## Startup

```bash
# npx
npx debug-hub start

# Global install
npm i -g debug-hub
debug-hub start --port 39200

# Project devDependency
# package.json: "debug": "debug-hub start"
```

Output:
```
✓ debug-hub server started
  HTTP API:  http://localhost:39200/api
  Web UI:    http://localhost:39200
  MCP:       stdio mode (for coding agent)
```

## Implementation Phases

1. **Phase 1**: Core server (HTTP API + storage + types)
2. **Phase 2**: MCP tools + Node.js SDK
3. **Phase 3**: Browser SDK + Go SDK
4. **Phase 4**: Web UI
5. **Phase 5**: Integration testing + documentation
