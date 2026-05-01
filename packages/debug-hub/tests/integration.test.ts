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

    const stats = await handler('debug_hub.get_stats', {});
    assert.equal(stats.totalLogs, 3);
    assert.equal(stats.errorCount, 1);

    const searchResults = await handler('debug_hub.search_logs', { keyword: 'connection' });
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].message, 'connection failed');

    const traceResults = await handler('debug_hub.search_logs', { traceId: 't1' });
    assert.equal(traceResults.length, 3);
  });

  it('event bus receives log events from API', async () => {
    const events = new EventBus();
    const received: any[] = [];
    events.on('log', (data) => received.push(data));

    // Create a separate server with this event bus
    const server2 = createApiServer(storage, events);
    await server2.listen(0);
    const url = `http://127.0.0.1:${server2.address().port}`;

    await fetch(`${url}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeEntry({ message: 'event test' })),
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].message, 'event test');

    await server2.close();
  });
});
