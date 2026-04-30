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
