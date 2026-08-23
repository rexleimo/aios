import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { finalizeSession, resetFinalizeRegistry } from '../lib/lifecycle/session-hooks/finalize.mjs';
import { readSessionCloseCandidate } from '../lib/lifecycle/session-hooks/close.mjs';
import { resolveContextDbRoot } from '../lib/aios/state-root.mjs';
import { recordSessionChangedFile } from '../lib/session/changed-files.mjs';

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function seedSessionEvents(rootDir, sessionId, events) {
  const contextDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  const sessionDir = path.join(contextDbRoot, 'sessions', sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(eventsPath, lines + '\n', 'utf8');
}

test('finalizeSession generates candidate on normal completion', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-normal-', async (workspaceRoot) => {
    const sessionId = 'finalizer-normal-001';

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Refactored the API module successfully.', ts: new Date().toISOString() },
    ]);

    const candidate = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'completed',
      status: 'done',
    });

    assert.ok(candidate, 'should generate a candidate');
    assert.equal(candidate.candidateId, `session-close:${sessionId}`);
    assert.equal(candidate.status, 'candidate');
    assert.equal(candidate.scope, 'project_shared');

    // Verify persisted
    const persisted = await readSessionCloseCandidate({ rootDir: workspaceRoot, sessionId });
    assert.deepEqual(persisted, candidate);
  });
});

test('finalizeSession generates candidate on user abort', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-abort-', async (workspaceRoot) => {
    const sessionId = 'finalizer-abort-001';

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Working on the refactor...', ts: new Date().toISOString() },
    ]);

    const candidate = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'aborted',
      status: 'cancelled',
    });

    assert.ok(candidate, 'should generate a candidate even on abort');
    assert.equal(candidate.candidateId, `session-close:${sessionId}`);
  });
});

test('finalizeSession generates candidate on timeout', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-timeout-', async (workspaceRoot) => {
    const sessionId = 'finalizer-timeout-001';

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Still processing...', ts: new Date().toISOString() },
    ]);

    const candidate = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'timeout',
      status: 'error',
    });

    assert.ok(candidate, 'should generate a candidate even on timeout');
    assert.equal(candidate.candidateId, `session-close:${sessionId}`);
  });
});

test('finalizeSession is idempotent — repeated calls return same candidate', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-idempotent-', async (workspaceRoot) => {
    const sessionId = 'finalizer-idempotent-001';

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Done.', ts: new Date().toISOString() },
    ]);

    const first = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'completed',
      status: 'done',
    });

    const second = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'completed',
      status: 'done',
    });

    const third = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'completed',
      status: 'done',
    });

    assert.ok(first, 'first call should generate candidate');
    assert.deepEqual(second, first, 'second call should return same candidate');
    assert.deepEqual(third, first, 'third call should return same candidate');

    // Verify only one file was written (idempotent write)
    const persisted = await readSessionCloseCandidate({ rootDir: workspaceRoot, sessionId });
    assert.deepEqual(persisted, first);
  });
});

test('finalizeSession isolates errors and returns null on failure', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-error-', async (workspaceRoot) => {
    const sessionId = 'finalizer-error-001';
    const silentLogger = { log: () => {}, error: () => {} };

    // Call with an invalid sessionId that will cause path traversal to fail
    const candidate = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId: '../outside-path',
      reason: 'completed',
      status: 'done',
      logger: silentLogger,
    });

    // Should return null (failed silently) instead of throwing
    assert.equal(candidate, null, 'should return null on failure');
  });
});

test('finalizeSession returns null when sessionId is missing', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-nosession-', async (workspaceRoot) => {
    const candidate = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId: '',
      reason: 'completed',
      status: 'done',
    });

    assert.equal(candidate, null, 'should return null when sessionId is empty');
  });
});

test('finalizeSession returns null when rootDir is missing', async () => {
  resetFinalizeRegistry();
  const candidate = await finalizeSession({
    rootDir: '',
    sessionId: 'test-session',
    reason: 'completed',
    status: 'done',
  });

  assert.equal(candidate, null, 'should return null when rootDir is empty');
});

test('finalizeSession does not pollute active memo storage', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-nopollute-', async (workspaceRoot) => {
    const sessionId = 'finalizer-nopollute-001';

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Completed task.', ts: new Date().toISOString() },
    ]);

    const candidate = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'completed',
      status: 'done',
    });

    assert.ok(candidate, 'should generate candidate');

    // Verify the candidate is NOT in the active memo events
    const memoEventsPath = path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl');
    let memoContent = '';
    try {
      memoContent = await fs.readFile(memoEventsPath, 'utf8');
    } catch {
      // File doesn't exist — that's correct, no pollution
    }
    assert.ok(
      !memoContent.includes(sessionId),
      'candidate should NOT be written to active memo storage'
    );
  });
});

test('finalizeSession handles session with touched files', async () => {
  resetFinalizeRegistry();
  await withWorkspace('aios-finalize-files-', async (workspaceRoot) => {
    const sessionId = 'finalizer-files-001';

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Updated the config.', ts: new Date().toISOString() },
    ]);
    await recordSessionChangedFile({ rootDir: workspaceRoot, sessionId, filePath: 'config/settings.json', changeType: 'modified' });
    await recordSessionChangedFile({ rootDir: workspaceRoot, sessionId, filePath: 'src/main.mjs', changeType: 'created' });

    const candidate = await finalizeSession({
      rootDir: workspaceRoot,
      sessionId,
      reason: 'completed',
      status: 'done',
    });

    assert.ok(candidate, 'should generate candidate');
    assert.ok(candidate.refs.includes('config/settings.json'), 'should include touched files');
    assert.ok(candidate.refs.includes('src/main.mjs'), 'should include touched files');
  });
});
