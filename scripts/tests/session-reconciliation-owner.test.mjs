import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { reconcileUnclosedSessions } from '../lib/lifecycle/session-hooks/reconcile.mjs';
import { claimSessionOwner } from '../lib/harness/solo-journal/owner.mjs';
import { getSoloHarnessPaths } from '../lib/harness/solo-journal/paths.mjs';
import { resolveContextDbRoot } from '../lib/aios/state-root.mjs';

async function withWorkspace(prefix, fn) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try { await fn(rootDir); } finally { await fs.rm(rootDir, { recursive: true, force: true }); }
}

async function seedSession(rootDir, sessionId) {
  const ctx = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  const journal = getSoloHarnessPaths({ rootDir, sessionId });
  await fs.mkdir(journal.dir, { recursive: true });
  await fs.writeFile(journal.summaryPath, JSON.stringify({
    schemaVersion: 1,
    sessionId,
    status: 'running',
    objective: 'long task',
    lastIteration: 2,
    updatedAt: '2026-08-22T10:00:00Z',
  }));
  await fs.mkdir(path.join(ctx, 'sessions', sessionId), { recursive: true });
}

test('reconcile skips a stale summary while owner process is alive', async () => {
  await withWorkspace('aios-reconcile-owner-', async (rootDir) => {
    await seedSession(rootDir, 'owner-session');
    const lease = await claimSessionOwner({ rootDir, sessionId: 'owner-session', heartbeatMs: 60000 });
    try {
      const result = await reconcileUnclosedSessions({
        rootDir,
        now: new Date('2026-08-22T12:00:00Z'),
        logger: { log() {} },
      });
      assert.equal(result.reconciled.length, 0);
      assert.ok(result.skipped.some((entry) => entry.reason === 'owner-alive'));
    } finally {
      await lease.stop();
    }
  });
});
