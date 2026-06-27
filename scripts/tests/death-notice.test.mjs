import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDeathNotice,
  computeDedupKey,
  resolveDeathNoticesPath,
  writeDeathNotice,
  readDeathNotices,
  hasDuplicateNotice,
  VALID_DEATH_REASONS,
} from '../lib/lifecycle/death-notice.mjs';

/* ================================================================
   Notice schema tests
   ================================================================ */

test('buildDeathNotice returns correctly shaped notice', () => {
  const agentId = 'codex-cli';
  const sessionId = 'session-abc-123';
  const reason = 'crash';
  const lastKnownState = { lastIteration: 3, lastAction: 'editing file.ts' };
  const timestamp = '2026-06-27T10:00:00.000Z';

  const notice = buildDeathNotice({ agentId, sessionId, reason, lastKnownState, timestamp });

  assert.equal(notice.type, 'worker_died');
  assert.equal(notice.agent_id, agentId);
  assert.equal(notice.session_id, sessionId);
  assert.equal(notice.reason, reason);
  assert.deepEqual(notice.last_known_state, lastKnownState);
  assert.equal(notice.timestamp, timestamp);
  assert.equal(typeof notice.dedup_key, 'string');
  assert.equal(notice.dedup_key.length, 16);
});

test('buildDeathNotice generates dedup_key from agentId+sessionId', () => {
  const notice = buildDeathNotice({ agentId: 'worker-a', sessionId: 'session-1', reason: 'timeout' });
  const notice2 = buildDeathNotice({ agentId: 'worker-a', sessionId: 'session-1', reason: 'crash' });
  assert.equal(notice.dedup_key, notice2.dedup_key, 'same agentId+sessionId should produce same dedup_key');
  assert.equal(notice.dedup_key, computeDedupKey('worker-a', 'session-1'));
});

test('buildDeathNotice generates different dedup_key for different sessions', () => {
  const n1 = buildDeathNotice({ agentId: 'worker-a', sessionId: 'session-1', reason: 'timeout' });
  const n2 = buildDeathNotice({ agentId: 'worker-a', sessionId: 'session-2', reason: 'timeout' });
  assert.notEqual(n1.dedup_key, n2.dedup_key);
});

test('buildDeathNotice auto-generates timestamp if not provided', () => {
  const notice = buildDeathNotice({ agentId: 'codex-cli', sessionId: 'session-1', reason: 'crash' });
  assert.equal(typeof notice.timestamp, 'string');
  assert(notice.timestamp.endsWith('Z') || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(notice.timestamp));
});

test('buildDeathNotice rejects invalid reasons', () => {
  assert.throws(() => buildDeathNotice({ agentId: 'codex-cli', sessionId: 'session-1', reason: 'unknown' }));
  assert.throws(() => buildDeathNotice({ agentId: 'codex-cli', sessionId: 'session-1', reason: '' }));
});

test('buildDeathNotice rejects missing required fields', () => {
  assert.throws(() => buildDeathNotice({}), /agentId/);
  assert.throws(() => buildDeathNotice({ agentId: 'codex-cli' }), /sessionId/);
});

test('VALID_DEATH_REASONS contains all expected reasons', () => {
  assert.deepEqual([...VALID_DEATH_REASONS].sort(), ['crash', 'manual_kill', 'timeout', 'zombie'].sort());
});

test('buildDeathNotice last_known_state defaults to empty object', () => {
  const notice = buildDeathNotice({ agentId: 'codex-cli', sessionId: 'session-1', reason: 'zombie' });
  assert.deepEqual(notice.last_known_state, {});
});

/* ================================================================
   write + read roundtrip tests
   ================================================================ */

test('writeDeathNotice writes to correct path under .aios/context-db', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-write-'));
  const sessionId = 'test-session-write';

  const notice = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'crash' });
  const writtenPath = await writeDeathNotice(rootDir, notice);

  const expectedPath = resolveDeathNoticesPath(rootDir, sessionId);
  assert.equal(writtenPath, expectedPath);
  assert(writtenPath.endsWith('death-notices.jsonl'));
});

test('writeDeathNotice creates directories and appends to JSONL', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-append-'));
  const sessionId = 'test-session-append';

  const notice1 = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'crash', timestamp: '2026-01-01T00:00:00.000Z' });
  const notice2 = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'zombie', timestamp: '2026-01-01T00:01:00.000Z' });

  await writeDeathNotice(rootDir, notice1);
  await writeDeathNotice(rootDir, notice2);

  const raw = await readFile(resolveDeathNoticesPath(rootDir, sessionId), 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).reason, 'crash');
  assert.equal(JSON.parse(lines[1]).reason, 'zombie');
});

test('readDeathNotices returns notices after writing', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-roundtrip-'));
  const sessionId = 'test-session-roundtrip';

  const notice = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'timeout', lastKnownState: { phase: 'evaluation' } });
  await writeDeathNotice(rootDir, notice);

  const notices = await readDeathNotices(rootDir, sessionId);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].reason, 'timeout');
  assert.equal(notices[0].agent_id, 'codex-cli');
  assert.deepEqual(notices[0].last_known_state, { phase: 'evaluation' });
});

test('writeDeathNotice rejects non-notice objects', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-reject-'));
  await assert.rejects(() => writeDeathNotice(rootDir, { type: 'foo' }));
  await assert.rejects(() => writeDeathNotice(rootDir, { type: 'worker_died' })); // missing session_id
  await assert.rejects(() => writeDeathNotice(rootDir, null));
});

test('readDeathNotices parses only worker_died entries, skipping malformed', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-malformed-'));
  const sessionId = 'test-session-malformed';
  const filePath = resolveDeathNoticesPath(rootDir, sessionId);
  await mkdir(path.dirname(filePath), { recursive: true });

  // Write a mix of valid and invalid lines directly (overwrite)
  const valid1 = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'crash' });
  const valid2 = { type: 'worker_died', agent_id: 'codex-cli', session_id: sessionId, reason: 'zombie', last_known_state: {}, timestamp: '2026-01-01T00:00:00.000Z', dedup_key: 'abc123' };
  const raw = JSON.stringify(valid1) + '\nnot-json\n{"type":"other","agent_id":"x"}\n' + JSON.stringify(valid2) + '\n';
  await writeFile(filePath, raw, 'utf8');

  const notices = await readDeathNotices(rootDir, sessionId);
  assert.equal(notices.length, 2);
});

/* ================================================================
   Dedup logic tests
   ================================================================ */

test('hasDuplicateNotice detects duplicate by dedup_key', () => {
  const existing = [
    buildDeathNotice({ agentId: 'codex-cli', sessionId: 'session-1', reason: 'crash' }),
    buildDeathNotice({ agentId: 'worker-b', sessionId: 'session-1', reason: 'timeout' }),
  ];

  const duplicate = buildDeathNotice({ agentId: 'codex-cli', sessionId: 'session-1', reason: 'zombie' });
  const newNotice = buildDeathNotice({ agentId: 'worker-c', sessionId: 'session-1', reason: 'manual_kill' });

  assert.equal(hasDuplicateNotice(existing, duplicate), true);
  assert.equal(hasDuplicateNotice(existing, newNotice), false);
});

test('hasDuplicateNotice returns false for empty or invalid inputs', () => {
  const existing = [buildDeathNotice({ agentId: 'codex-cli', sessionId: 'session-1', reason: 'crash' })];

  assert.equal(hasDuplicateNotice([], existing[0]), false);
  assert.equal(hasDuplicateNotice(existing, null), false);
  assert.equal(hasDuplicateNotice(existing, { type: 'worker_died' }), false); // missing dedup_key
  assert.equal(hasDuplicateNotice('not-array', existing[0]), false);
});

test('hasDuplicateNotice returns true on second write + read roundtrip', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-dedup-'));
  const sessionId = 'test-session-dedup';

  const notice = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'crash' });
  await writeDeathNotice(rootDir, notice);

  // Second write with same agentId+sessionId (different reason)
  const notice2 = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'zombie' });
  await writeDeathNotice(rootDir, notice2);

  const notices = await readDeathNotices(rootDir, sessionId);
  assert.equal(notices.length, 2);

  // A third attempt should be recognized as duplicate
  const notice3 = buildDeathNotice({ agentId: 'codex-cli', sessionId, reason: 'timeout' });
  assert.equal(hasDuplicateNotice(notices, notice3), true);
});

/* ================================================================
   Missing session handling tests
   ================================================================ */

test('readDeathNotices returns empty array for nonexistent session', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-missing-'));
  const notices = await readDeathNotices(rootDir, 'nonexistent-session');
  assert.deepEqual(notices, []);
});

test('readDeathNotices returns empty array for empty string session', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-empty-'));
  const notices = await readDeathNotices(rootDir, '');
  assert.deepEqual(notices, []);
});

test('readDeathNotices returns empty array for null/undefined session', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'death-notice-null-'));
  const notices = await readDeathNotices(rootDir, null);
  assert.deepEqual(notices, []);
});

test('resolveDeathNoticesPath returns path under sessions dir', () => {
  const rootDir = '/tmp/test-root';
  const sessionId = 'session-xyz';
  const resolved = resolveDeathNoticesPath(rootDir, sessionId);
  assert(resolved.endsWith(path.join('sessions', sessionId, 'death-notices.jsonl')));
  assert(resolved.startsWith(rootDir));
});
