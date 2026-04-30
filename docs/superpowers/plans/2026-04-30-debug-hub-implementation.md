# debug-hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local debug log collection service with MCP tools, HTTP API, embedded Web UI, and SDKs for Node.js, Browser, and Go.

**Architecture:** Single-process monolith with JSON/JSONL file storage, in-process event bus, and SSE for real-time updates. MCP server provides query tools for coding agents.

**Tech Stack:** TypeScript, Node.js 22+, MCP SDK (`@modelcontextprotocol/sdk`), native HTTP server (no Express dependency for API), vanilla JS for Web UI, Go for SDK.

**Spec:** `docs/superpowers/specs/2026-04-30-debug-hub-design.md`

---

## File Structure

```
packages/debug-hub/
├── src/
│   ├── types.ts                  # Shared type definitions (LogEntry, Trace, SpanSummary)
│   ├── storage.ts                # JSON/JSONL file storage engine
│   ├── events.ts                 # In-process event bus
│   ├── api.ts                    # HTTP API routes (native node:http)
│   ├── mcp.ts                    # MCP tool definitions + handler
│   ├── server.ts                 # Server entry: starts HTTP + MCP stdio
│   ├── ui.html                   # Embedded Web UI (single HTML file)
│   └── cli.ts                    # CLI entry point (bin)
├── sdk/
│   ├── node/
│   │   ├── src/
│   │   │   ├── index.ts          # Public API (DebugHub class)
│   │   │   ├── client.ts         # HTTP client for log reporting
│   │   │   ├── trace.ts          # Trace/Span implementation
│   │   │   └── types.ts          # SDK-specific types
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── browser/
│   │   ├── src/
│   │   │   ├── index.ts          # Public API (DebugHub class)
│   │   │   ├── client.ts         # fetch-based HTTP client
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── go/
│       ├── debughub.go           # Main client
│       ├── trace.go              # Trace/Span
│       ├── types.go              # Type definitions
│       └── go.mod
├── tests/
│   ├── storage.test.ts
│   ├── events.test.ts
│   ├── api.test.ts
│   ├── mcp.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `packages/debug-hub/package.json`
- Create: `packages/debug-hub/tsconfig.json`
- Create: `packages/debug-hub/src/types.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "debug-hub",
  "version": "0.1.0",
  "type": "module",
  "description": "Debug log collection service for coding agents",
  "engines": {
    "node": ">=22 <23"
  },
  "bin": {
    "debug-hub": "./dist/cli.js"
  },
  "main": "./dist/server.js",
  "types": "./dist/server.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "start": "node dist/cli.js",
    "test": "tsx --test tests/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "sdk"]
}
```

- [ ] **Step 3: Create src/types.ts**

```typescript
// src/types.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogSource {
  file?: string;
  line?: number;
  function?: string;
  module?: string;
}

export interface LogTrace {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface LogError {
  name: string;
  message: string;
  stack?: string;
}

export interface SdkMeta {
  name: string;
  version: string;
  runtime: 'node' | 'browser' | 'go';
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source: LogSource;
  trace: LogTrace;
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
  error?: LogError;
  sdk: SdkMeta;
}

export interface SpanSummary {
  spanId: string;
  message: string;
  level: LogLevel;
  duration?: number;
  children?: SpanSummary[];
}

export interface Trace {
  traceId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  spanCount: number;
  errorCount: number;
  rootSpan: SpanSummary;
  tags?: Record<string, string>;
}

export interface Stats {
  totalLogs: number;
  totalTraces: number;
  errorCount: number;
  levelCounts: Record<LogLevel, number>;
  recentErrors: Array<{ message: string; timestamp: number; traceId?: string }>;
}

export interface SearchQuery {
  keyword?: string;
  level?: LogLevel;
  since?: number;
  module?: string;
  traceId?: string;
  limit?: number;
}
```

- [ ] **Step 4: Create directories and install dependencies**

```bash
cd packages/debug-hub
mkdir -p src sdk/node/src sdk/browser/src sdk/go tests
npm install
```

- [ ] **Step 5: Verify typecheck passes**

```bash
cd packages/debug-hub
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/debug-hub/
git commit -m "feat(debug-hub): scaffold project with types"
```

---

### Task 2: Storage Engine

**Files:**
- Create: `packages/debug-hub/src/storage.ts`
- Create: `packages/debug-hub/tests/storage.test.ts`

- [ ] **Step 1: Write failing tests for storage**

```typescript
// tests/storage.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/storage.js';
import type { LogEntry } from '../src/types.js';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level: 'info',
    message: 'test message',
    source: { module: 'test-module' },
    trace: { traceId: 'trace-1', spanId: 'span-1' },
    sdk: { name: 'test', version: '1.0.0', runtime: 'node' },
    ...overrides,
  };
}

describe('Storage', () => {
  let tmpDir: string;
  let storage: Storage;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'debug-hub-test-'));
    storage = new Storage(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write and read log entries', async () => {
    const entry = makeEntry({ message: 'hello world' });
    await storage.writeLog(entry);

    const logs = await storage.readLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].message, 'hello world');
  });

  it('should append to daily JSONL file', async () => {
    await storage.writeLog(makeEntry({ message: 'first' }));
    await storage.writeLog(makeEntry({ message: 'second' }));

    const logs = await storage.readLogs();
    assert.equal(logs.length, 2);
  });

  it('should search logs by keyword', async () => {
    await storage.writeLog(makeEntry({ message: 'user login success' }));
    await storage.writeLog(makeEntry({ message: 'database error' }));

    const results = await storage.searchLogs({ keyword: 'login' });
    assert.equal(results.length, 1);
    assert.equal(results[0].message, 'user login success');
  });

  it('should search logs by level', async () => {
    await storage.writeLog(makeEntry({ level: 'info', message: 'ok' }));
    await storage.writeLog(makeEntry({ level: 'error', message: 'fail' }));

    const results = await storage.searchLogs({ level: 'error' });
    assert.equal(results.length, 1);
    assert.equal(results[0].level, 'error');
  });

  it('should write and read trace files', async () => {
    const entry = makeEntry({ trace: { traceId: 't1', spanId: 's1' } });
    await storage.writeLog(entry);

    // writeTrace should create a trace file
    await storage.writeTrace({
      traceId: 't1',
      startTime: Date.now(),
      endTime: Date.now() + 100,
      duration: 100,
      spanCount: 1,
      errorCount: 0,
      rootSpan: { spanId: 's1', message: 'test', level: 'info' },
    });

    const traces = await storage.listTraces();
    assert.equal(traces.length, 1);
    assert.equal(traces[0].traceId, 't1');

    const detail = await storage.getTrace('t1');
    assert.ok(detail);
    assert.equal(detail.traceId, 't1');
  });

  it('should return stats', async () => {
    await storage.writeLog(makeEntry({ level: 'info' }));
    await storage.writeLog(makeEntry({ level: 'error' }));
    await storage.writeLog(makeEntry({ level: 'error' }));

    const stats = await storage.getStats();
    assert.equal(stats.totalLogs, 3);
    assert.equal(stats.levelCounts.error, 2);
    assert.equal(stats.levelCounts.info, 1);
  });

  it('should clear logs', async () => {
    await storage.writeLog(makeEntry());
    await storage.writeLog(makeEntry());

    await storage.clearLogs();
    const logs = await storage.readLogs();
    assert.equal(logs.length, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/debug-hub
npx tsx --test tests/storage.test.ts
```

Expected: FAIL — `storage.ts` does not exist.

- [ ] **Step 3: Implement storage engine**

```typescript
// src/storage.ts
import { readFile, writeFile, appendFile, mkdir, readdir, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { LogEntry, Trace, Stats, SearchQuery } from './types.js';

export class Storage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private logsDir() { return join(this.baseDir, 'logs'); }
  private tracesDir() { return join(this.baseDir, 'traces'); }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.logsDir(), { recursive: true });
    await mkdir(this.tracesDir(), { recursive: true });
  }

  private dailyFile(): string {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return join(this.logsDir(), `${date}.jsonl`);
  }

  async writeLog(entry: LogEntry): Promise<void> {
    await this.ensureDirs();
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.dailyFile(), line, 'utf-8');
  }

  async readLogs(limit = 1000): Promise<LogEntry[]> {
    if (!existsSync(this.logsDir())) return [];
    const files = (await readdir(this.logsDir()))
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse();

    const entries: LogEntry[] = [];
    for (const file of files) {
      const content = await readFile(join(this.logsDir(), file), 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch { /* skip malformed lines */ }
      }
      if (entries.length >= limit) break;
    }
    return entries.slice(0, limit);
  }

  async searchLogs(query: SearchQuery): Promise<LogEntry[]> {
    const limit = query.limit ?? 100;
    const all = await this.readLogs(limit * 5);

    return all.filter(entry => {
      if (query.keyword && !entry.message.includes(query.keyword)) return false;
      if (query.level && entry.level !== query.level) return false;
      if (query.since && entry.timestamp < query.since) return false;
      if (query.module && entry.source?.module !== query.module) return false;
      if (query.traceId && entry.trace?.traceId !== query.traceId) return false;
      return true;
    }).slice(0, limit);
  }

  async writeTrace(trace: Trace): Promise<void> {
    await this.ensureDirs();
    const filePath = join(this.tracesDir(), `${trace.traceId}.json`);
    await writeFile(filePath, JSON.stringify(trace, null, 2), 'utf-8');
  }

  async getTrace(traceId: string): Promise<Trace | null> {
    const filePath = join(this.tracesDir(), `${traceId}.json`);
    if (!existsSync(filePath)) return null;
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  async listTraces(limit = 50): Promise<Trace[]> {
    if (!existsSync(this.tracesDir())) return [];
    const files = (await readdir(this.tracesDir()))
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const traces: Trace[] = [];
    for (const file of files) {
      const content = await readFile(join(this.tracesDir(), file), 'utf-8');
      try { traces.push(JSON.parse(content)); } catch { /* skip */ }
    }
    return traces;
  }

  async getStats(): Promise<Stats> {
    const logs = await this.readLogs();
    const levelCounts = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 };
    const recentErrors: Stats['recentErrors'] = [];

    for (const entry of logs) {
      levelCounts[entry.level]++;
      if (entry.level === 'error' || entry.level === 'fatal') {
        recentErrors.push({
          message: entry.message,
          timestamp: entry.timestamp,
          traceId: entry.trace?.traceId,
        });
      }
    }

    const traces = await this.listTraces();

    return {
      totalLogs: logs.length,
      totalTraces: traces.length,
      errorCount: levelCounts.error + levelCounts.fatal,
      levelCounts,
      recentErrors: recentErrors.slice(0, 20),
    };
  }

  async clearLogs(olderThan?: number): Promise<void> {
    if (!existsSync(this.logsDir())) return;
    if (!olderThan) {
      await rm(this.logsDir(), { recursive: true, force: true });
      await rm(this.tracesDir(), { recursive: true, force: true });
      return;
    }
    // For olderThan, rewrite files filtering out old entries
    const files = await readdir(this.logsDir());
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const content = await readFile(join(this.logsDir(), file), 'utf-8');
      const kept = content.split('\n').filter(line => {
        if (!line.trim()) return false;
        try {
          const entry: LogEntry = JSON.parse(line);
          return entry.timestamp >= olderThan;
        } catch { return false; }
      });
      if (kept.length === 0) {
        await unlink(join(this.logsDir(), file));
      } else {
        await writeFile(join(this.logsDir(), file), kept.join('\n') + '\n', 'utf-8');
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/debug-hub
npx tsx --test tests/storage.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/debug-hub/src/storage.ts packages/debug-hub/tests/storage.test.ts
git commit -m "feat(debug-hub): implement JSON/JSONL storage engine"
```

---

### Task 3: Event Bus

**Files:**
- Create: `packages/debug-hub/src/events.ts`
- Create: `packages/debug-hub/tests/events.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/events.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/events.js';

describe('EventBus', () => {
  it('should emit and receive events', () => {
    const bus = new EventBus();
    let received: string | null = null;

    bus.on('log', (data) => { received = data.message; });
    bus.emit('log', { message: 'hello' });

    assert.equal(received, 'hello');
  });

  it('should support multiple listeners', () => {
    const bus = new EventBus();
    let count = 0;

    bus.on('log', () => { count++; });
    bus.on('log', () => { count++; });
    bus.emit('log', {});

    assert.equal(count, 2);
  });

  it('should support unsubscribe', () => {
    const bus = new EventBus();
    let count = 0;

    const unsub = bus.on('log', () => { count++; });
    bus.emit('log', {});
    unsub();
    bus.emit('log', {});

    assert.equal(count, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/debug-hub
npx tsx --test tests/events.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement event bus**

```typescript
// src/events.ts
type Listener = (data: any) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  emit(event: string, data: any): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try { listener(data); } catch { /* swallow listener errors */ }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/debug-hub
npx tsx --test tests/events.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/debug-hub/src/events.ts packages/debug-hub/tests/events.test.ts
git commit -m "feat(debug-hub): implement in-process event bus"
```

---

### Task 4: HTTP API Server

**Files:**
- Create: `packages/debug-hub/src/api.ts`
- Create: `packages/debug-hub/tests/api.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/api.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiServer } from '../src/api.js';
import { Storage } from '../src/storage.js';
import { EventBus } from '../src/events.js';
import type { LogEntry } from '../src/types.js';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level: 'info',
    message: 'test',
    source: { module: 'test' },
    trace: { traceId: 't1', spanId: 's1' },
    sdk: { name: 'test', version: '1.0.0', runtime: 'node' },
    ...overrides,
  };
}

describe('HTTP API', () => {
  let tmpDir: string;
  let server: ReturnType<typeof createApiServer>;
  let baseUrl: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'debug-hub-api-'));
    const storage = new Storage(tmpDir);
    const events = new EventBus();
    server = createApiServer(storage, events);
    await server.listen(0);
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/logs/single should accept a single log entry', async () => {
    const entry = makeEntry({ message: 'single log' });
    const res = await fetch(`${baseUrl}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  it('POST /api/logs should accept batch log entries', async () => {
    const entries = [makeEntry({ message: 'batch1' }), makeEntry({ message: 'batch2' })];
    const res = await fetch(`${baseUrl}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 2);
  });

  it('GET /api/stats should return statistics', async () => {
    // Write some logs first
    await fetch(`${baseUrl}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeEntry({ level: 'error' })),
    });

    const res = await fetch(`${baseUrl}/api/stats`);
    assert.equal(res.status, 200);
    const stats = await res.json();
    assert.equal(stats.totalLogs, 1);
    assert.equal(stats.errorCount, 1);
  });

  it('GET /api/logs/search should search logs', async () => {
    await fetch(`${baseUrl}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeEntry({ message: 'find me' })),
    });
    await fetch(`${baseUrl}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeEntry({ message: 'skip me' })),
    });

    const res = await fetch(`${baseUrl}/api/logs/search?keyword=find`);
    assert.equal(res.status, 200);
    const results = await res.json();
    assert.equal(results.length, 1);
    assert.equal(results[0].message, 'find me');
  });

  it('GET /api/traces should list traces', async () => {
    const res = await fetch(`${baseUrl}/api/traces`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
  });

  it('DELETE /api/logs should clear all logs', async () => {
    await fetch(`${baseUrl}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeEntry()),
    });

    const delRes = await fetch(`${baseUrl}/api/logs`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);

    const statsRes = await fetch(`${baseUrl}/api/stats`);
    const stats = await statsRes.json();
    assert.equal(stats.totalLogs, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/debug-hub
npx tsx --test tests/api.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement HTTP API**

```typescript
// src/api.ts
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { Storage } from './storage.js';
import type { EventBus } from './events.js';
import type { LogEntry } from './types.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx < 1) return {};
  const params = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, string> = {};
  for (const [k, v] of params) result[k] = v;
  return result;
}

export interface ApiServer {
  listen(port: number): Promise<void>;
  close(): Promise<void>;
  address(): { port: number };
}

export function createApiServer(storage: Storage, events: EventBus): ApiServer {
  const clients = new Set<ServerResponse>();

  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    const method = req.method || 'GET';

    try {
      // POST /api/logs/single
      if (method === 'POST' && url === '/api/logs/single') {
        const body = JSON.parse(await readBody(req));
        await storage.writeLog(body as LogEntry);
        events.emit('log', body);
        sendJson(res, 200, { success: true });
        return;
      }

      // POST /api/logs
      if (method === 'POST' && url === '/api/logs') {
        const entries: LogEntry[] = JSON.parse(await readBody(req));
        for (const entry of entries) {
          await storage.writeLog(entry);
          events.emit('log', entry);
        }
        sendJson(res, 200, { success: true, count: entries.length });
        return;
      }

      // GET /api/traces
      if (method === 'GET' && url === '/api/traces') {
        const traces = await storage.listTraces();
        sendJson(res, 200, traces);
        return;
      }

      // GET /api/traces/:id
      const traceMatch = /^\/api\/traces\/([^/]+)$/.exec(url);
      if (method === 'GET' && traceMatch) {
        const trace = await storage.getTrace(traceMatch[1]);
        if (!trace) { sendJson(res, 404, { error: 'Trace not found' }); return; }
        sendJson(res, 200, trace);
        return;
      }

      // GET /api/logs/search
      if (method === 'GET' && url.startsWith('/api/logs/search')) {
        const q = parseQuery(url);
        const results = await storage.searchLogs({
          keyword: q.keyword,
          level: q.level as any,
          since: q.since ? Number(q.since) : undefined,
          module: q.module,
          traceId: q.traceId,
          limit: q.limit ? Number(q.limit) : undefined,
        });
        sendJson(res, 200, results);
        return;
      }

      // GET /api/stats
      if (method === 'GET' && url === '/api/stats') {
        const stats = await storage.getStats();
        sendJson(res, 200, stats);
        return;
      }

      // DELETE /api/logs
      if (method === 'DELETE' && url === '/api/logs') {
        await storage.clearLogs();
        sendJson(res, 200, { success: true });
        return;
      }

      // GET /api/events (SSE)
      if (method === 'GET' && url === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      // Serve Web UI
      if (method === 'GET' && (url === '/' || url === '/index.html')) {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const dir = fileURLToPath(new URL('.', import.meta.url));
        const html = await readFile(join(dir, 'ui.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // SSE broadcast on new logs
  events.on('log', (entry) => {
    const data = `data: ${JSON.stringify(entry)}\n\n`;
    for (const client of clients) {
      client.write(data);
    }
  });

  let httpServer: Server;

  return {
    listen(port: number): Promise<void> {
      return new Promise((resolve) => {
        httpServer = server.listen(port, '127.0.0.1', () => {
          resolve();
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        for (const client of clients) {
          client.end();
        }
        httpServer.close(() => resolve());
      });
    },
    address(): { port: number } {
      const addr = httpServer.address();
      if (typeof addr === 'string' || !addr) return { port: 0 };
      return { port: addr.port };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/debug-hub
npx tsx --test tests/api.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/debug-hub/src/api.ts packages/debug-hub/tests/api.test.ts
git commit -m "feat(debug-hub): implement HTTP API server"
```

---

### Task 5: MCP Tools

**Files:**
- Create: `packages/debug-hub/src/mcp.ts`
- Create: `packages/debug-hub/tests/mcp.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/mcp.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMcpHandler } from '../src/mcp.js';
import { Storage } from '../src/storage.js';
import type { LogEntry } from '../src/types.js';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level: 'info',
    message: 'test',
    source: { module: 'test-module' },
    trace: { traceId: 't1', spanId: 's1' },
    sdk: { name: 'test', version: '1.0.0', runtime: 'node' },
    ...overrides,
  };
}

describe('MCP Tools', () => {
  let tmpDir: string;
  let storage: Storage;
  let handler: ReturnType<typeof createMcpHandler>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'debug-hub-mcp-'));
    storage = new Storage(tmpDir);
    handler = createMcpHandler(storage);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('debug_hub.get_stats should return stats', async () => {
    await storage.writeLog(makeEntry());
    const result = await handler('debug_hub.get_stats', {});
    assert.equal(result.totalLogs, 1);
  });

  it('debug_hub.list_traces should return traces', async () => {
    const result = await handler('debug_hub.list_traces', {});
    assert.ok(Array.isArray(result));
  });

  it('debug_hub.search_logs should search logs', async () => {
    await storage.writeLog(makeEntry({ message: 'find me' }));
    await storage.writeLog(makeEntry({ message: 'skip' }));

    const result = await handler('debug_hub.search_logs', { keyword: 'find' });
    assert.equal(result.length, 1);
    assert.equal(result[0].message, 'find me');
  });

  it('debug_hub.get_trace should return null for missing trace', async () => {
    const result = await handler('debug_hub.get_trace', { traceId: 'nonexistent' });
    assert.equal(result, null);
  });

  it('debug_hub.clear_logs should clear logs', async () => {
    await storage.writeLog(makeEntry());
    await handler('debug_hub.clear_logs', {});

    const stats = await handler('debug_hub.get_stats', {});
    assert.equal(stats.totalLogs, 0);
  });

  it('should throw on unknown tool', async () => {
    await assert.rejects(
      () => handler('unknown_tool', {}),
      { message: /Unknown tool/ }
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/debug-hub
npx tsx --test tests/mcp.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement MCP handler**

```typescript
// src/mcp.ts
import type { Storage } from './storage.js';
import type { SearchQuery, LogLevel } from './types.js';

export const mcpToolDefinitions = [
  {
    name: 'debug_hub.list_traces',
    description: 'List recent debug traces',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max traces to return', default: 20 },
      },
    },
  },
  {
    name: 'debug_hub.get_trace',
    description: 'Get full trace details by trace ID',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: { type: 'string', description: 'The trace ID' },
      },
      required: ['traceId'],
    },
  },
  {
    name: 'debug_hub.search_logs',
    description: 'Search logs by keyword, level, time range, or module',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword in message' },
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
        since: { type: 'number', description: 'Unix timestamp ms, only return logs after this time' },
        module: { type: 'string', description: 'Filter by source module name' },
        traceId: { type: 'string', description: 'Filter by trace ID' },
        limit: { type: 'number', default: 50 },
      },
    },
  },
  {
    name: 'debug_hub.get_stats',
    description: 'Get log statistics (counts, error summary)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'debug_hub.clear_logs',
    description: 'Clear collected logs',
    inputSchema: {
      type: 'object',
      properties: {
        olderThan: { type: 'number', description: 'Unix timestamp ms, only clear logs older than this' },
      },
    },
  },
];

export function createMcpHandler(storage: Storage) {
  return async function handleTool(name: string, args: Record<string, unknown>): Promise<any> {
    switch (name) {
      case 'debug_hub.list_traces':
        return await storage.listTraces((args.limit as number) ?? 20);

      case 'debug_hub.get_trace':
        return await storage.getTrace(args.traceId as string);

      case 'debug_hub.search_logs':
        return await storage.searchLogs({
          keyword: args.keyword as string | undefined,
          level: args.level as LogLevel | undefined,
          since: args.since as number | undefined,
          module: args.module as string | undefined,
          traceId: args.traceId as string | undefined,
          limit: (args.limit as number) ?? 50,
        });

      case 'debug_hub.get_stats':
        return await storage.getStats();

      case 'debug_hub.clear_logs':
        await storage.clearLogs(args.olderThan as number | undefined);
        return { success: true };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/debug-hub
npx tsx --test tests/mcp.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/debug-hub/src/mcp.ts packages/debug-hub/tests/mcp.test.ts
git commit -m "feat(debug-hub): implement MCP tool handler"
```

---

### Task 6: Server Entry Point (MCP + HTTP combined)

**Files:**
- Create: `packages/debug-hub/src/server.ts`
- Create: `packages/debug-hub/src/cli.ts`

- [ ] **Step 1: Create server.ts**

```typescript
// src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Storage } from './storage.js';
import { EventBus } from './events.js';
import { createApiServer, type ApiServer } from './api.js';
import { createMcpHandler, mcpToolDefinitions } from './mcp.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ServerOptions {
  port?: number;
  dataDir?: string;
}

export async function startServer(options: ServerOptions = {}): Promise<{ http: ApiServer; mcp: Server }> {
  const port = options.port ?? 39200;
  const dataDir = options.dataDir ?? join(homedir(), '.debug-hub');

  const storage = new Storage(dataDir);
  const events = new EventBus();
  const handler = createMcpHandler(storage);

  // Start HTTP API
  const http = createApiServer(storage, events);
  await http.listen(port);

  // Create MCP server
  const mcp = new Server(
    { name: 'debug-hub', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpToolDefinitions,
  }));

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handler(name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  });

  // Connect MCP stdio transport
  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  console.error(`✓ debug-hub server started`);
  console.error(`  HTTP API:  http://127.0.0.1:${port}/api`);
  console.error(`  Web UI:    http://127.0.0.1:${port}`);
  console.error(`  MCP:       stdio mode`);

  return { http, mcp };
}

// Re-export for programmatic use
export { Storage } from './storage.js';
export { EventBus } from './events.js';
export { createApiServer } from './api.js';
export { createMcpHandler, mcpToolDefinitions } from './mcp.js';
export type * from './types.js';
```

- [ ] **Step 2: Create cli.ts**

```typescript
// src/cli.ts
import { startServer } from './server.js';

const args = process.argv.slice(2);
let port = 39200;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = Number(args[i + 1]);
    i++;
  }
}

startServer({ port }).catch((err) => {
  console.error('Failed to start debug-hub:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd packages/debug-hub
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/debug-hub/src/server.ts packages/debug-hub/src/cli.ts
git commit -m "feat(debug-hub): implement server entry point and CLI"
```

---

### Task 7: Node.js SDK

**Files:**
- Create: `packages/debug-hub/sdk/node/package.json`
- Create: `packages/debug-hub/sdk/node/tsconfig.json`
- Create: `packages/debug-hub/sdk/node/src/types.ts`
- Create: `packages/debug-hub/sdk/node/src/client.ts`
- Create: `packages/debug-hub/sdk/node/src/trace.ts`
- Create: `packages/debug-hub/sdk/node/src/index.ts`

- [ ] **Step 1: Create sdk/node/package.json**

```json
{
  "name": "@debug-hub/node",
  "version": "0.1.0",
  "type": "module",
  "description": "debug-hub Node.js SDK",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.3.0"
  },
  "files": ["dist"]
}
```

- [ ] **Step 2: Create sdk/node/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create sdk/node/src/types.ts**

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source: {
    file?: string;
    line?: number;
    function?: string;
    module?: string;
  };
  trace: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
  };
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  sdk: {
    name: string;
    version: string;
    runtime: 'node';
  };
}

export interface DebugHubConfig {
  service: string;
  endpoint?: string;
  tags?: Record<string, string>;
}
```

- [ ] **Step 4: Create sdk/node/src/client.ts**

```typescript
import type { LogEntry } from './types.js';

export class HttpClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async sendLog(entry: LogEntry): Promise<void> {
    const res = await fetch(`${this.endpoint}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      throw new Error(`Failed to send log: ${res.status} ${res.statusText}`);
    }
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    const res = await fetch(`${this.endpoint}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    });
    if (!res.ok) {
      throw new Error(`Failed to send logs: ${res.status} ${res.statusText}`);
    }
  }
}
```

- [ ] **Step 5: Create sdk/node/src/trace.ts**

```typescript
import type { LogEntry, LogLevel, DebugHubConfig } from './types.js';
import type { HttpClient } from './client.js';

let idCounter = 0;
function nextId(): string {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

export class Span {
  private entries: LogEntry[] = [];
  private _ended = false;

  constructor(
    readonly spanId: string,
    readonly traceId: string,
    readonly parentSpanId: string | undefined,
    private readonly config: DebugHubConfig,
    private readonly client: HttpClient,
  ) {}

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    if (this._ended) return;
    const entry: LogEntry = {
      id: nextId(),
      timestamp: Date.now(),
      level,
      message,
      source: {},
      trace: {
        traceId: this.traceId,
        spanId: this.spanId,
        parentSpanId: this.parentSpanId,
      },
      data,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      sdk: { name: '@debug-hub/node', version: '0.1.0', runtime: 'node' },
      tags: this.config.tags,
    };
    this.entries.push(entry);
    // Fire and forget
    this.client.sendLog(entry).catch(() => {});
  }

  debug(message: string, data?: Record<string, unknown>) { this.log('debug', message, data); }
  info(message: string, data?: Record<string, unknown>) { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>, error?: Error) { this.log('error', message, data, error); }
  fatal(message: string, data?: Record<string, unknown>, error?: Error) { this.log('fatal', message, data, error); }

  span(message: string): Span {
    return new Span(nextId(), this.traceId, this.spanId, this.config, this.client);
  }

  end(): void {
    this._ended = true;
  }

  getEntries(): LogEntry[] { return [...this.entries]; }
}

export class Trace extends Span {
  readonly startTime: number;

  constructor(
    traceId: string,
    message: string,
    config: DebugHubConfig,
    client: HttpClient,
  ) {
    super(traceId, traceId, undefined, config, client);
    this.startTime = Date.now();
    this.info(message);
  }
}
```

- [ ] **Step 6: Create sdk/node/src/index.ts**

```typescript
import type { DebugHubConfig, LogLevel } from './types.js';
import { HttpClient } from './client.js';
import { Trace, Span } from './trace.js';

export { Trace, Span } from './trace.js';
export type { DebugHubConfig, LogEntry, LogLevel } from './types.js';

let idCounter = 0;
function nextId(): string {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

export class DebugHub {
  private client: HttpClient;
  private config: DebugHubConfig;

  constructor(config: DebugHubConfig) {
    this.config = config;
    this.client = new HttpClient(config.endpoint ?? 'http://localhost:39200');
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    const entry = {
      id: nextId(),
      timestamp: Date.now(),
      level,
      message,
      source: {},
      trace: { traceId: nextId(), spanId: nextId() },
      data,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      sdk: { name: '@debug-hub/node', version: '0.1.0', runtime: 'node' as const },
      tags: this.config.tags,
    };
    this.client.sendLog(entry).catch(() => {});
  }

  debug(message: string, data?: Record<string, unknown>) { this.log('debug', message, data); }
  info(message: string, data?: Record<string, unknown>) { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>, error?: Error) { this.log('error', message, data, error); }
  fatal(message: string, data?: Record<string, unknown>, error?: Error) { this.log('fatal', message, data, error); }

  startTrace(message: string): Trace {
    return new Trace(nextId(), message, this.config, this.client);
  }
}
```

- [ ] **Step 7: Verify typecheck**

```bash
cd packages/debug-hub/sdk/node
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add packages/debug-hub/sdk/node/
git commit -m "feat(debug-hub): implement Node.js SDK"
```

---

### Task 8: Browser SDK

**Files:**
- Create: `packages/debug-hub/sdk/browser/package.json`
- Create: `packages/debug-hub/sdk/browser/tsconfig.json`
- Create: `packages/debug-hub/sdk/browser/src/types.ts`
- Create: `packages/debug-hub/sdk/browser/src/client.ts`
- Create: `packages/debug-hub/sdk/browser/src/index.ts`

- [ ] **Step 1: Create sdk/browser/package.json**

```json
{
  "name": "@debug-hub/browser",
  "version": "0.1.0",
  "type": "module",
  "description": "debug-hub Browser SDK",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  },
  "files": ["dist"]
}
```

- [ ] **Step 2: Create sdk/browser/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create sdk/browser/src/types.ts**

Same as node types but runtime is `'browser'`:

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source: {
    file?: string;
    line?: number;
    function?: string;
    module?: string;
  };
  trace: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
  };
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  sdk: {
    name: string;
    version: string;
    runtime: 'browser';
  };
}

export interface DebugHubConfig {
  service: string;
  endpoint?: string;
  tags?: Record<string, string>;
}
```

- [ ] **Step 4: Create sdk/browser/src/client.ts**

```typescript
import type { LogEntry } from './types.js';

export class HttpClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async sendLog(entry: LogEntry): Promise<void> {
    await fetch(`${this.endpoint}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true, // Allow page unload to complete
    });
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    await fetch(`${this.endpoint}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
      keepalive: true,
    });
  }
}
```

- [ ] **Step 5: Create sdk/browser/src/index.ts**

```typescript
import type { DebugHubConfig, LogLevel, LogEntry } from './types.js';
import { HttpClient } from './client.js';

export type { DebugHubConfig, LogEntry, LogLevel } from './types.js';

let idCounter = 0;
function nextId(): string {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

export class DebugHub {
  private client: HttpClient;
  private config: DebugHubConfig;

  constructor(config: DebugHubConfig) {
    this.config = config;
    this.client = new HttpClient(config.endpoint ?? 'http://localhost:39200');
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    const entry: LogEntry = {
      id: nextId(),
      timestamp: Date.now(),
      level,
      message,
      source: {},
      trace: { traceId: nextId(), spanId: nextId() },
      data,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      sdk: { name: '@debug-hub/browser', version: '0.1.0', runtime: 'browser' },
      tags: this.config.tags,
    };
    this.client.sendLog(entry).catch(() => {});
  }

  debug(message: string, data?: Record<string, unknown>) { this.log('debug', message, data); }
  info(message: string, data?: Record<string, unknown>) { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>, error?: Error) { this.log('error', message, data, error); }
  fatal(message: string, data?: Record<string, unknown>, error?: Error) { this.log('fatal', message, data, error); }
}
```

- [ ] **Step 6: Verify typecheck**

```bash
cd packages/debug-hub/sdk/browser
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/debug-hub/sdk/browser/
git commit -m "feat(debug-hub): implement Browser SDK"
```

---

### Task 9: Go SDK

**Files:**
- Create: `packages/debug-hub/sdk/go/go.mod`
- Create: `packages/debug-hub/sdk/go/types.go`
- Create: `packages/debug-hub/sdk/go/debughub.go`
- Create: `packages/debug-hub/sdk/go/trace.go`

- [ ] **Step 1: Create go.mod**

```
module github.com/rex/debug-hub/sdk/go

go 1.22
```

- [ ] **Step 2: Create types.go**

```go
package debughub

import "time"

type LogLevel string

const (
	LogDebug LogLevel = "debug"
	LogInfo  LogLevel = "info"
	LogWarn  LogLevel = "warn"
	LogError LogLevel = "error"
	LogFatal LogLevel = "fatal"
)

type LogSource struct {
	File     string `json:"file,omitempty"`
	Line     int    `json:"line,omitempty"`
	Function string `json:"function,omitempty"`
	Module   string `json:"module,omitempty"`
}

type LogTrace struct {
	TraceID      string `json:"traceId"`
	SpanID       string `json:"spanId"`
	ParentSpanID string `json:"parentSpanId,omitempty"`
}

type LogErrorInfo struct {
	Name    string `json:"name"`
	Message string `json:"message"`
	Stack   string `json:"stack,omitempty"`
}

type SdkMeta struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Runtime string `json:"runtime"`
}

type LogEntry struct {
	ID        string                 `json:"id"`
	Timestamp int64                  `json:"timestamp"`
	Level     LogLevel               `json:"level"`
	Message   string                 `json:"message"`
	Source    LogSource              `json:"source"`
	Trace     LogTrace               `json:"trace"`
	Tags      map[string]string      `json:"tags,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Error     *LogErrorInfo          `json:"error,omitempty"`
	Sdk       SdkMeta                `json:"sdk"`
}

type Config struct {
	Service  string
	Endpoint string
	Tags     map[string]string
}

func (c *Config) endpointOrDefault() string {
	if c.Endpoint == "" {
		return "http://localhost:39200"
	}
	return c.Endpoint
}
```

- [ ] **Step 3: Create debughub.go**

```go
package debughub

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"
)

var counter atomic.Int64

func nextID() string {
	counter.Add(1)
	return fmt.Sprintf("%x-%x", time.Now().UnixMilli(), counter.Load())
}

type DebugHub struct {
	config Config
	client *http.Client
}

func New(config Config) *DebugHub {
	return &DebugHub{
		config: config,
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

func (d *DebugHub) log(level LogLevel, message string, data map[string]interface{}, err error) {
	entry := LogEntry{
		ID:        nextID(),
		Timestamp: time.Now().UnixMilli(),
		Level:     level,
		Message:   message,
		Source:    LogSource{},
		Trace:     LogTrace{TraceID: nextID(), SpanID: nextID()},
		Data:      data,
		Sdk: SdkMeta{
			Name:    "debug-hub-go",
			Version: "0.1.0",
			Runtime: "go",
		},
		Tags: d.config.Tags,
	}
	if err != nil {
		entry.Error = &LogErrorInfo{
			Name:    "Error",
			Message: err.Error(),
		}
	}
	go d.send(entry)
}

func (d *DebugHub) send(entry LogEntry) {
	body, _ := json.Marshal(entry)
	url := d.config.endpointOrDefault() + "/api/logs/single"
	http.Post(url, "application/json", bytes.NewReader(body))
}

func (d *DebugHub) Debug(message string, data ...map[string]interface{}) {
	d.log(LogDebug, message, firstOr(data), nil)
}

func (d *DebugHub) Info(message string, data ...map[string]interface{}) {
	d.log(LogInfo, message, firstOr(data), nil)
}

func (d *DebugHub) Warn(message string, data ...map[string]interface{}) {
	d.log(LogWarn, message, firstOr(data), nil)
}

func (d *DebugHub) Error(message string, err error, data ...map[string]interface{}) {
	d.log(LogError, message, firstOr(data), err)
}

func (d *DebugHub) Fatal(message string, err error, data ...map[string]interface{}) {
	d.log(LogFatal, message, firstOr(data), err)
}

func (d *DebugHub) StartTrace(message string) *Trace {
	traceID := nextID()
	t := &Trace{
		traceID:  traceID,
		config:   d.config,
		client:   d.client,
		startTime: time.Now(),
	}
	span := t.Span(message)
	span.End()
	return t
}

func firstOr(data []map[string]interface{}) map[string]interface{} {
	if len(data) > 0 {
		return data[0]
	}
	return nil
}
```

- [ ] **Step 4: Create trace.go**

```go
package debughub

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"
)

type Span struct {
	spanID       string
	traceID      string
	parentSpanID string
	config       Config
	client       *http.Client
	entries      []LogEntry
	ended        bool
}

func (s *Span) log(level LogLevel, message string, data map[string]interface{}, err error) {
	if s.ended {
		return
	}
	entry := LogEntry{
		ID:        nextID(),
		Timestamp: time.Now().UnixMilli(),
		Level:     level,
		Message:   message,
		Source:    LogSource{},
		Trace: LogTrace{
			TraceID:      s.traceID,
			SpanID:       s.spanID,
			ParentSpanID: s.parentSpanID,
		},
		Data: data,
		Sdk: SdkMeta{
			Name:    "debug-hub-go",
			Version: "0.1.0",
			Runtime: "go",
		},
		Tags: s.config.Tags,
	}
	if err != nil {
		entry.Error = &LogErrorInfo{
			Name:    "Error",
			Message: err.Error(),
		}
	}
	s.entries = append(s.entries, entry)
	go func() {
		body, _ := json.Marshal(entry)
		url := s.config.endpointOrDefault() + "/api/logs/single"
		http.Post(url, "application/json", bytes.NewReader(body))
	}()
}

func (s *Span) Debug(message string, data ...map[string]interface{}) {
	s.log(LogDebug, message, firstOr(data), nil)
}

func (s *Span) Info(message string, data ...map[string]interface{}) {
	s.log(LogInfo, message, firstOr(data), nil)
}

func (s *Span) Warn(message string, data ...map[string]interface{}) {
	s.log(LogWarn, message, firstOr(data), nil)
}

func (s *Span) Error(message string, err error, data ...map[string]interface{}) {
	s.log(LogError, message, firstOr(data), err)
}

func (s *Span) Fatal(message string, err error, data ...map[string]interface{}) {
	s.log(LogFatal, message, firstOr(data), err)
}

func (s *Span) Span(message string) *Span {
	return &Span{
		spanID:       nextID(),
		traceID:      s.traceID,
		parentSpanID: s.spanID,
		config:       s.config,
		client:       s.client,
	}
}

func (s *Span) End() {
	s.ended = true
}

type Trace struct {
	traceID   string
	config    Config
	client    *http.Client
	startTime time.Time
}

func (t *Trace) Span(message string) *Span {
	return &Span{
		spanID:       nextID(),
		traceID:      t.traceID,
		parentSpanID: t.traceID,
		config:       t.config,
		client:       t.client,
	}
}

func (t *Trace) End() {
	// Trace end is a no-op; spans track their own lifecycle
}
```

- [ ] **Step 5: Verify Go code compiles**

```bash
cd packages/debug-hub/sdk/go
go vet ./...
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/debug-hub/sdk/go/
git commit -m "feat(debug-hub): implement Go SDK"
```

---

### Task 10: Web UI

**Files:**
- Create: `packages/debug-hub/src/ui.html`

- [ ] **Step 1: Create embedded Web UI**

Create `packages/debug-hub/src/ui.html` — a single HTML file with vanilla JS:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>debug-hub</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: #0d1117; color: #c9d1d9; }
  .container { max-width: 1200px; margin: 0 auto; padding: 16px; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #21262d; }
  .header h1 { font-size: 20px; color: #58a6ff; }
  .tabs { display: flex; gap: 4px; margin-bottom: 16px; }
  .tab { padding: 8px 16px; background: #161b22; border: 1px solid #21262d; border-radius: 6px; cursor: pointer; color: #8b949e; font-size: 14px; }
  .tab.active { background: #21262d; color: #58a6ff; border-color: #58a6ff; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat-card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 16px; }
  .stat-card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; }
  .stat-card .value { font-size: 28px; font-weight: bold; margin-top: 4px; }
  .stat-card .value.error { color: #f85149; }
  .stat-card .value.warn { color: #d29922; }
  .stat-card .value.info { color: #58a6ff; }
  .search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
  .search-bar input, .search-bar select { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 8px 12px; color: #c9d1d9; font-size: 14px; }
  .search-bar input { flex: 1; }
  .log-list { list-style: none; }
  .log-item { padding: 10px 12px; border-bottom: 1px solid #21262d; font-size: 13px; display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }
  .log-item:hover { background: #161b22; }
  .log-level { font-weight: bold; min-width: 50px; text-transform: uppercase; font-size: 11px; padding: 2px 6px; border-radius: 3px; text-align: center; }
  .log-level.debug { color: #8b949e; background: #21262d; }
  .log-level.info { color: #58a6ff; background: #0d2a4e; }
  .log-level.warn { color: #d29922; background: #2d1b00; }
  .log-level.error { color: #f85149; background: #3d0000; }
  .log-level.fatal { color: #fff; background: #f85149; }
  .log-time { color: #484f58; min-width: 80px; }
  .log-msg { flex: 1; word-break: break-word; }
  .log-module { color: #8b949e; font-size: 11px; min-width: 100px; text-align: right; }
  .trace-list { list-style: none; }
  .trace-item { padding: 12px; border-bottom: 1px solid #21262d; cursor: pointer; }
  .trace-item:hover { background: #161b22; }
  .trace-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .trace-id { color: #58a6ff; font-family: monospace; font-size: 13px; }
  .trace-meta { color: #8b949e; font-size: 12px; }
  .trace-tree { margin-left: 20px; }
  .span-node { padding: 4px 0; font-size: 13px; }
  .span-node .span-msg { color: #c9d1d9; }
  .span-node .span-dur { color: #8b949e; font-size: 11px; }
  .empty { text-align: center; color: #484f58; padding: 40px; font-size: 14px; }
  .live-indicator { display: inline-block; width: 8px; height: 8px; background: #3fb950; border-radius: 50; margin-right: 6px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>debug-hub</h1>
    <span id="live-status"><span class="live-indicator"></span>Live</span>
  </div>
  <div class="tabs">
    <div class="tab active" data-tab="dashboard">Dashboard</div>
    <div class="tab" data-tab="logs">Logs</div>
    <div class="tab" data-tab="traces">Traces</div>
  </div>

  <div id="tab-dashboard">
    <div class="stats" id="stats"></div>
    <h3 style="margin-bottom:12px;color:#8b949e;font-size:14px;">Recent Errors</h3>
    <ul class="log-list" id="recent-errors"></ul>
  </div>

  <div id="tab-logs" style="display:none;">
    <div class="search-bar">
      <input type="text" id="search-keyword" placeholder="Search logs...">
      <select id="search-level">
        <option value="">All levels</option>
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
        <option value="fatal">Fatal</option>
      </select>
    </div>
    <ul class="log-list" id="log-list"></ul>
  </div>

  <div id="tab-traces" style="display:none;">
    <ul class="trace-list" id="trace-list"></ul>
  </div>
</div>

<script>
const API = '/api';
let currentTab = 'dashboard';

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    document.getElementById('tab-dashboard').style.display = currentTab === 'dashboard' ? '' : 'none';
    document.getElementById('tab-logs').style.display = currentTab === 'logs' ? '' : 'none';
    document.getElementById('tab-traces').style.display = currentTab === 'traces' ? '' : 'none';
    refresh();
  });
});

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

async function loadStats() {
  const res = await fetch(`${API}/stats`);
  const stats = await res.json();
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="label">Total Logs</div><div class="value">${stats.totalLogs}</div></div>
    <div class="stat-card"><div class="label">Traces</div><div class="value">${stats.totalTraces}</div></div>
    <div class="stat-card"><div class="label">Errors</div><div class="value error">${stats.errorCount}</div></div>
    <div class="stat-card"><div class="label">Info</div><div class="value info">${stats.levelCounts.info || 0}</div></div>
    <div class="stat-card"><div class="label">Warnings</div><div class="value warn">${stats.levelCounts.warn || 0}</div></div>
  `;
  const errorList = document.getElementById('recent-errors');
  if (stats.recentErrors.length === 0) {
    errorList.innerHTML = '<li class="empty">No recent errors</li>';
  } else {
    errorList.innerHTML = stats.recentErrors.map(e => `
      <li class="log-item">
        <span class="log-time">${formatTime(e.timestamp)}</span>
        <span class="log-msg">${escHtml(e.message)}</span>
        ${e.traceId ? `<span class="log-module">${e.traceId.slice(0, 8)}</span>` : ''}
      </li>
    `).join('');
  }
}

async function loadLogs() {
  const keyword = document.getElementById('search-keyword').value;
  const level = document.getElementById('search-level').value;
  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  if (level) params.set('level', level);
  params.set('limit', '200');
  const res = await fetch(`${API}/logs/search?${params}`);
  const logs = await res.json();
  const list = document.getElementById('log-list');
  if (logs.length === 0) {
    list.innerHTML = '<li class="empty">No logs found</li>';
  } else {
    list.innerHTML = logs.map(e => `
      <li class="log-item" data-trace="${e.trace?.traceId || ''}">
        <span class="log-level ${e.level}">${e.level}</span>
        <span class="log-time">${formatTime(e.timestamp)}</span>
        <span class="log-msg">${escHtml(e.message)}</span>
        <span class="log-module">${e.source?.module || ''}</span>
      </li>
    `).join('');
  }
}

async function loadTraces() {
  const res = await fetch(`${API}/traces`);
  const traces = await res.json();
  const list = document.getElementById('trace-list');
  if (traces.length === 0) {
    list.innerHTML = '<li class="empty">No traces yet</li>';
  } else {
    list.innerHTML = traces.map(t => `
      <li class="trace-item" data-id="${t.traceId}">
        <div class="trace-header">
          <span class="trace-id">${t.traceId}</span>
          <span class="trace-meta">${t.spanCount} spans · ${t.errorCount} errors · ${t.duration || 0}ms</span>
        </div>
        ${renderSpanTree(t.rootSpan, 0)}
      </li>
    `).join('');
  }
}

function renderSpanTree(span, depth) {
  if (!span) return '';
  const indent = depth * 16;
  return `<div class="span-node" style="margin-left:${indent}px">
    <span class="span-msg">${escHtml(span.message)}</span>
    <span class="span-dur">${span.duration ? span.duration + 'ms' : ''}</span>
    ${(span.children || []).map(c => renderSpanTree(c, depth + 1)).join('')}
  </div>`;
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function refresh() {
  if (currentTab === 'dashboard') await loadStats();
  if (currentTab === 'logs') await loadLogs();
  if (currentTab === 'traces') await loadTraces();
}

// Search on input
document.getElementById('search-keyword').addEventListener('input', debounce(loadLogs, 300));
document.getElementById('search-level').addEventListener('change', loadLogs);

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// SSE for live updates
const evtSource = new EventSource(`${API}/events`);
evtSource.onmessage = () => refresh();

// Initial load
refresh();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add packages/debug-hub/src/ui.html
git commit -m "feat(debug-hub): implement embedded Web UI"
```

---

### Task 11: Integration Test

**Files:**
- Create: `packages/debug-hub/tests/integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiServer } from '../src/api.js';
import { Storage } from '../src/storage.js';
import { EventBus } from '../src/events.js';
import { createMcpHandler } from '../src/mcp.js';
import type { LogEntry } from '../src/types.js';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level: 'info',
    message: 'test',
    source: { module: 'test-module' },
    trace: { traceId: 't1', spanId: 's1' },
    sdk: { name: 'test', version: '1.0.0', runtime: 'node' },
    ...overrides,
  };
}

describe('Integration', () => {
  let tmpDir: string;
  let baseUrl: string;
  let server: ReturnType<typeof createApiServer>;
  let storage: Storage;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'debug-hub-int-'));
    storage = new Storage(tmpDir);
    const events = new EventBus();
    server = createApiServer(storage, events);
    await server.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    await server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full flow: report logs via API, query via MCP handler', async () => {
    const handler = createMcpHandler(storage);

    // Report logs via HTTP API
    const entries = [
      makeEntry({ level: 'info', message: 'server started', trace: { traceId: 't1', spanId: 's1' } }),
      makeEntry({ level: 'error', message: 'connection failed', trace: { traceId: 't1', spanId: 's2' } }),
      makeEntry({ level: 'info', message: 'retry success', trace: { traceId: 't1', spanId: 's3' } }),
    ];

    for (const entry of entries) {
      const res = await fetch(`${baseUrl}/api/logs/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      assert.equal(res.status, 200);
    }

    // Query via MCP
    const stats = await handler('debug_hub.get_stats', {});
    assert.equal(stats.totalLogs, 3);
    assert.equal(stats.errorCount, 1);

    const searchResults = await handler('debug_hub.search_logs', { keyword: 'connection' });
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].message, 'connection failed');

    const traceResults = await handler('debug_hub.search_logs', { traceId: 't1' });
    assert.equal(traceResults.length, 3);
  });

  it('SSE should receive new log events', async () => {
    const eventsReceived: any[] = [];

    // Connect SSE
    const res = await fetch(`${baseUrl}/api/events`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No reader');

    // Start reading SSE in background
    const readPromise = (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            eventsReceived.push(JSON.parse(line.slice(6)));
          }
        }
        buffer = lines[lines.length - 1];
      }
    })();

    // Wait a bit for SSE connection to establish
    await new Promise(r => setTimeout(r, 100));

    // Send a log
    await fetch(`${baseUrl}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeEntry({ message: 'sse test' })),
    });

    // Wait for event
    await new Promise(r => setTimeout(r, 200));
    reader.cancel();

    assert.ok(eventsReceived.length >= 1);
    assert.equal(eventsReceived[0].message, 'sse test');
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd packages/debug-hub
npx tsx --test tests/integration.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Run all tests**

```bash
cd packages/debug-hub
npx tsx --test tests/*.test.ts
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/debug-hub/tests/integration.test.ts
git commit -m "test(debug-hub): add integration tests"
```

---

### Task 12: README and Final Polish

**Files:**
- Create: `packages/debug-hub/README.md`

- [ ] **Step 1: Create README.md**

```markdown
# debug-hub

Debug log collection service for coding agents.

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

### HTTP API

```bash
# Report a log
curl -X POST http://localhost:39200/api/logs/single \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","timestamp":1714500000000,"level":"info","message":"hello","source":{},"trace":{"traceId":"t1","spanId":"s1"},"sdk":{"name":"test","version":"1.0","runtime":"node"}}'

# Get stats
curl http://localhost:39200/api/stats

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

Logs are stored in `~/.debug-hub/` as JSON files:

```
~/.debug-hub/
├── logs/2026-04-30.jsonl    # Daily log stream
├── traces/{traceId}.json    # Trace files
└── index.json               # Stats index
```

Agent can directly read these files with `cat` or `grep`.
```

- [ ] **Step 2: Final typecheck**

```bash
cd packages/debug-hub
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run all tests one final time**

```bash
cd packages/debug-hub
npx tsx --test tests/*.test.ts
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/debug-hub/README.md
git commit -m "docs(debug-hub): add README"
```
