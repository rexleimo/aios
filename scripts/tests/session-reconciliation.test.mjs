import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  reconcileUnclosedSessions,
  interruptionPath,
  DEFAULT_STALE_AFTER_MS,
} from '../lib/lifecycle/session-hooks/reconcile.mjs';
import { readSessionCloseCandidate } from '../lib/lifecycle/session-hooks/close.mjs';
import { getSoloHarnessPaths } from '../lib/harness/solo-journal/paths.mjs';
import { claimSessionOwner } from '../lib/harness/solo-journal/owner.mjs';
import { resolveContextDbRoot } from '../lib/aios/state-root.mjs';

async function withWorkspace(prefix, fn) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(rootDir);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

async function seedSession(rootDir, sessionId, { status = 'running', updatedAt, lastIteration = 3 } = {}) {
  const sessionRoot = path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId);
  const journal = getSoloHarnessPaths({ rootDir, sessionId });
  await fs.mkdir(journal.dir, { recursive: true });
  await fs.writeFile(path.join(sessionRoot, 'l2-events.jsonl'), `${JSON.stringify({ role: 'assistant', text: `Work in ${sessionId}`, ts: updatedAt })}\n`, 'utf8');
  await fs.writeFile(journal.summaryPath, `${JSON.stringify({
    schemaVersion: 1,
    sessionId,
    status,
    objective: `Objective for ${sessionId}`,
    lastIteration,
    updatedAt,
  }, null, 2)}\n`, 'utf8');
}

test('reconcile records a stale running session and creates a candidate', async () => {
  await withWorkspace('aios-reconcile-stale-', async (rootDir) => {
    const now = new Date('2026-08-22T12:00:00Z');
    await seedSession(rootDir, 'stale-session', {
      status: 'running',
      updatedAt: new Date(now.getTime() - DEFAULT_STALE_AFTER_MS - 1).toISOString(),
      lastIteration: 4,
    });

    const result = await reconcileUnclosedSessions({ rootDir, now, logger: { log() {} } });
    assert.equal(result.reconciled.length, 1);
    assert.equal(result.reconciled[0].sessionId, 'stale-session');

    const record = JSON.parse(await fs.readFile(interruptionPath(rootDir, 'stale-session'), 'utf8'));
    assert.equal(record.status, 'interrupted');
    assert.equal(record.previousStatus, 'running');
    assert.equal(record.lastCompletedIteration, 4);
    assert.equal(record.resumeAvailable, true);
    assert.ok(record.evidenceRefs.some((ref) => ref.startsWith('checkpoint:')));

    const candidate = await readSessionCloseCandidate({ rootDir, sessionId: 'stale-session' });
    assert.equal(candidate.claimStatus, 'candidate');
  });
});

test('reconcile does not touch a recently updated running session', async () => {
  await withWorkspace('aios-reconcile-fresh-', async (rootDir) => {
    const now = new Date('2026-08-22T12:00:00Z');
    await seedSession(rootDir, 'fresh-session', { status: 'running', updatedAt: now.toISOString() });
    const result = await reconcileUnclosedSessions({ rootDir, now, logger: { log() {} } });
    assert.equal(result.reconciled.length, 0);
    assert.ok(result.skipped.some((entry) => entry.reason === 'not-stale'));
    await assert.rejects(() => fs.access(interruptionPath(rootDir, 'fresh-session')));
  });
});

test('reconcile does not touch terminal sessions', async () => {
  await withWorkspace('aios-reconcile-terminal-', async (rootDir) => {
    const old = '2026-08-22T10:00:00Z';
    await seedSession(rootDir, 'done-session', { status: 'done', updatedAt: old });
    await seedSession(rootDir, 'failed-session', { status: 'failed', updatedAt: old });
    const result = await reconcileUnclosedSessions({ rootDir, now: new Date('2026-08-22T12:00:00Z'), logger: { log() {} } });
    assert.equal(result.reconciled.length, 0);
    assert.ok(result.skipped.some((entry) => entry.reason === 'terminal:done'));
    assert.ok(result.skipped.some((entry) => entry.reason === 'terminal:failed'));
  });
});

test('reconcile never treats the current active session as interrupted', async () => {
  await withWorkspace('aios-reconcile-active-', async (rootDir) => {
    await seedSession(rootDir, 'active-session', { status: 'running', updatedAt: '2026-08-22T10:00:00Z' });
    const result = await reconcileUnclosedSessions({
      rootDir,
      activeSessionId: 'active-session',
      now: new Date('2026-08-22T12:00:00Z'),
      logger: { log() {} },
    });
    assert.equal(result.reconciled.length, 0);
    assert.ok(result.skipped.some((entry) => entry.reason === 'active-session'));
  });
});

test('reconcile is idempotent across repeated startup recovery', async () => {
  await withWorkspace('aios-reconcile-idempotent-', async (rootDir) => {
    const now = new Date('2026-08-22T12:00:00Z');
    await seedSession(rootDir, 'once-session', { status: 'backoff', updatedAt: '2026-08-22T10:00:00Z' });
    const first = await reconcileUnclosedSessions({ rootDir, now, logger: { log() {} } });
    const second = await reconcileUnclosedSessions({ rootDir, now, logger: { log() {} } });
    assert.equal(first.reconciled.length, 1);
    assert.equal(second.reconciled.length, 0);
    assert.ok(second.skipped.some((entry) => entry.reason === 'already-reconciled'));
  });
});

test('reconcile returns empty result when no sessions exist', async () => {
  await withWorkspace('aios-reconcile-empty-', async (rootDir) => {
    const result = await reconcileUnclosedSessions({ rootDir, logger: { log() {} } });
    assert.deepEqual(result, { inspected: 0, reconciled: [], skipped: [] });
  });
});
