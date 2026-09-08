import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendMemoEvent, setActiveMemoStorage } from '../lib/memo/storage.mjs';
import { collectEvents } from '../lib/memo/storage/events-read.mjs';
import { withMemoStorageLock } from '../lib/memo/storage/lock.mjs';
import { createGcSnapshot } from '../lib/lifecycle/dream/governance.mjs';

async function withRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-gc-lock-'));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('concurrent appends racing a lock-held GC rewrite lose no events', async () => {
  await withRoot(async (rootDir) => {
    await setActiveMemoStorage(rootDir, 'file');
    const keeperIds = [];
    for (let index = 0; index < 3; index += 1) {
      const event = await appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: `keeper ${index}` });
      keeperIds.push(event.eventId);
    }
    const targetIds = [];
    for (let index = 0; index < 2; index += 1) {
      const event = await appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: `gc target ${index}` });
      targetIds.push(event.eventId);
    }
    const proposal = {
      proposalId: 'gc-lock-proof',
      source: { storage: 'file' },
      actions: targetIds.map((eventId) => ({ eventId })),
    };

    // The GC snapshot-then-rewrite holds the memo storage lock across the
    // whole read-filter-write sequence — the same lock every append takes —
    // so racing writers queue instead of landing inside the rewrite window.
    const gcTask = withMemoStorageLock({ workspaceRoot: rootDir }, async () =>
      createGcSnapshot(rootDir, proposal, process.env, new Date()));
    const appendTasks = Array.from({ length: 10 }, (_, index) =>
      appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: `racer ${index}` }));
    const [gcResult, appended] = await Promise.all([gcTask, Promise.all(appendTasks)]);

    assert.equal(gcResult.snapshot.records.length, 2);
    const { events } = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    const liveIds = new Set(events.map((event) => event.eventId));
    for (const id of keeperIds) assert.ok(liveIds.has(id), `keeper survived GC race: ${id}`);
    for (const event of appended) assert.ok(liveIds.has(event.eventId), `racer survived GC race: ${event.eventId}`);
    for (const id of targetIds) assert.ok(!liveIds.has(id), `GC target removed: ${id}`);
    assert.equal(events.length, 3 + 10);
  });
});
