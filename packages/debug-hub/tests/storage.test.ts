import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
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

  it('should record and list instrument records', async () => {
    const record = await storage.recordInstrument('session-a', [
      { path: '/repo/src/auth.ts', lineCount: 3 },
    ]);

    assert.equal(record.sessionId, 'session-a');
    assert.equal(record.marker, 'DH:session-a');
    assert.equal(record.files.length, 1);
    assert.equal(record.files[0].path, '/repo/src/auth.ts');

    const list = await storage.listInstruments();
    assert.equal(list.length, 1);
    assert.equal(list[0].sessionId, 'session-a');
  });

  it('should merge instrument records for same session', async () => {
    await storage.recordInstrument('session-m', [
      { path: '/repo/src/a.ts' },
    ]);
    const merged = await storage.recordInstrument('session-m', [
      { path: '/repo/src/b.ts' },
    ]);

    assert.equal(merged.files.length, 2);
  });

  it('should filter instruments by sessionId', async () => {
    await storage.recordInstrument('s1', [{ path: '/a.ts' }]);
    await storage.recordInstrument('s2', [{ path: '/b.ts' }]);

    const filtered = await storage.listInstruments('s1');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].sessionId, 's1');
  });

  it('cleanupInstruments should remove debug lines from recorded files', async () => {
    const sessionId = 'cleanup-1';
    const tmpFile = join(tmpDir, 'test.ts');
    await writeFile(tmpFile, [
      'const x = 1;',
      `// DH:${sessionId} debug log`,
      `console.log("// DH:${sessionId} state", x);`,
      'export default x;',
    ].join('\n'), 'utf-8');

    await storage.recordInstrument(sessionId, [
      { path: tmpFile, lineCount: 2 },
    ]);

    const report = await storage.cleanupInstruments(sessionId);
    assert.equal(report.filesScanned, 1);
    assert.equal(report.filesModified, 1);
    assert.equal(report.linesRemoved, 2);
    assert.equal(report.dryRun, false);

    const content = await readFile(tmpFile, 'utf-8');
    assert.ok(!content.includes(`DH:${sessionId}`));
    assert.ok(content.includes('const x = 1;'));
    assert.ok(content.includes('export default x;'));
  });

  it('cleanupInstruments dryRun should not modify files', async () => {
    const sessionId = 'cleanup-dry';
    const tmpFile = join(tmpDir, 'dry.ts');
    const original = 'const x = 1;\n// DH:cleanup-dry debug\nconst y = 2;\n';
    await writeFile(tmpFile, original, 'utf-8');
    await storage.recordInstrument(sessionId, [{ path: tmpFile }]);

    const report = await storage.cleanupInstruments(sessionId, undefined, true);
    assert.equal(report.linesRemoved, 1);
    assert.equal(report.dryRun, true);

    const content = await readFile(tmpFile, 'utf-8');
    assert.equal(content, original);
  });

  it('cleanupInstruments discovery mode should grep workspace', async () => {
    const sessionId = 'disc-1';
    const subDir = join(tmpDir, 'src');
    await mkdir(subDir, { recursive: true });

    const tmpFile = join(subDir, 'discover.ts');
    await writeFile(tmpFile, [
      'const a = 1;',
      `// DH:${sessionId} trace`,
      'const b = 2;',
    ].join('\n'), 'utf-8');

    // No instrument record — falls back to grep
    const report = await storage.cleanupInstruments(sessionId, tmpDir);
    assert.equal(report.filesScanned, 1);
    assert.equal(report.linesRemoved, 1);

    const content = await readFile(tmpFile, 'utf-8');
    assert.ok(!content.includes(`DH:${sessionId}`));
  });

  it('cleanupInstruments should handle empty results gracefully', async () => {
    const report = await storage.cleanupInstruments('nonexistent');
    assert.equal(report.filesScanned, 0);
    assert.equal(report.linesRemoved, 0);
  });

  it('recordInstrument should reject path traversal in sessionId', async () => {
    await assert.rejects(
      () => storage.recordInstrument('../../etc/passwd', [{ path: '/tmp/x.ts' }]),
      { message: /Invalid/ },
    );
  });
});
