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

  it('debug_hub.start_session should create an agent debugging session', async () => {
    const session = await handler('debug_hub.start_session', {
      sessionId: 'session-1',
      objective: 'debug checkout failure',
      workspace: '/repo/app',
      agent: 'codex-cli',
    });

    assert.equal(session.sessionId, 'session-1');
    assert.equal(session.objective, 'debug checkout failure');
    assert.equal(session.status, 'active');
    assert.equal(session.workspace, '/repo/app');
    assert.equal(session.agent, 'codex-cli');
  });

  it('debug_hub.record_event should attach structured evidence to a session', async () => {
    await handler('debug_hub.start_session', {
      sessionId: 'session-1',
      objective: 'debug checkout failure',
    });

    const event = await handler('debug_hub.record_event', {
      sessionId: 'session-1',
      kind: 'hypothesis',
      level: 'info',
      message: 'payment timeout is caused by stale config',
      hypothesisId: 'h1',
      payload: { configKey: 'PAYMENT_URL' },
    });

    assert.equal(event.sessionId, 'session-1');
    assert.equal(event.kind, 'hypothesis');
    assert.equal(event.hypothesisId, 'h1');

    const detail = await handler('debug_hub.get_session', { sessionId: 'session-1' });
    assert.equal(detail.session.sessionId, 'session-1');
    assert.equal(detail.events.length, 1);
    assert.equal(detail.events[0].message, 'payment timeout is caused by stale config');
    assert.deepEqual(detail.events[0].payload, { configKey: 'PAYMENT_URL' });
  });

  it('debug_hub.timeline should return chronological session evidence', async () => {
    await handler('debug_hub.start_session', {
      sessionId: 'session-1',
      objective: 'debug checkout failure',
    });
    await handler('debug_hub.record_event', {
      sessionId: 'session-1',
      kind: 'hypothesis',
      message: 'config may be stale',
      hypothesisId: 'h1',
    });
    await handler('debug_hub.record_event', {
      sessionId: 'session-1',
      kind: 'verification',
      level: 'warn',
      message: 'reproduction still fails',
      runId: 'run-1',
    });

    const timeline = await handler('debug_hub.timeline', { sessionId: 'session-1' });
    assert.equal(timeline.length, 2);
    assert.equal(timeline[0].kind, 'hypothesis');
    assert.equal(timeline[1].kind, 'verification');
    assert.equal(timeline[1].runId, 'run-1');
  });

  it('debug_hub.health should report storage health for agent diagnostics', async () => {
    await handler('debug_hub.start_session', {
      sessionId: 'session-1',
      objective: 'debug checkout failure',
    });
    await handler('debug_hub.record_event', {
      sessionId: 'session-1',
      kind: 'note',
      message: 'collector is receiving evidence',
    });

    const health = await handler('debug_hub.health', {});
    assert.equal(health.status, 'ok');
    assert.equal(health.schemaVersion, '0.2.0');
    assert.equal(health.totalSessions, 1);
    assert.equal(health.totalEvents, 1);
    assert.ok(health.dataDir.includes('debug-hub-mcp-'));
  });

  it('debug_hub.compact_context should produce a bounded handoff pack', async () => {
    await handler('debug_hub.start_session', {
      sessionId: 'session-1',
      objective: 'debug checkout failure',
    });
    await storage.writeLog(makeEntry({
      level: 'error',
      message: 'checkout failed',
      tags: { sessionId: 'session-1' },
    }));
    await handler('debug_hub.record_event', {
      sessionId: 'session-1',
      kind: 'hypothesis',
      message: 'payment API is unavailable',
    });

    const context = await handler('debug_hub.compact_context', { sessionId: 'session-1', limit: 5 });
    assert.equal(context.session.objective, 'debug checkout failure');
    assert.equal(context.stats.errorCount, 1);
    assert.equal(context.recentErrors[0].message, 'checkout failed');
    assert.ok(context.timeline.length <= 5);
    assert.ok(context.timeline.some((item: any) => item.message === 'payment API is unavailable'));
  });

  it('should throw on unknown tool', async () => {
    await assert.rejects(
      () => handler('unknown_tool', {}),
      { message: /Unknown tool/ }
    );
  });
});
