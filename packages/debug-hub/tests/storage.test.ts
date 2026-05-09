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

  it('should materialize trace details from log entries with matching traceId', async () => {
    await storage.writeLog(makeEntry({
      id: 'root-log',
      timestamp: 1000,
      message: 'root span',
      trace: { traceId: 'trace-auto', spanId: 'root' },
    }));
    await storage.writeLog(makeEntry({
      id: 'child-log',
      timestamp: 1100,
      level: 'error',
      message: 'child failed',
      trace: { traceId: 'trace-auto', spanId: 'child', parentSpanId: 'root' },
    }));

    await storage.flushPendingTraces();
    const traces = await storage.listTraces();
    assert.equal(traces.length, 1);
    assert.equal(traces[0].traceId, 'trace-auto');
    assert.equal(traces[0].spanCount, 2);
    assert.equal(traces[0].errorCount, 1);

    const detail = await storage.getTrace('trace-auto');
    assert.ok(detail);
    assert.equal(detail.rootSpan.message, 'root span');
    assert.equal(detail.rootSpan.children?.[0]?.message, 'child failed');
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
