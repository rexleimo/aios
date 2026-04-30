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
