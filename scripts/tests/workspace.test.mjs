import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  initWorkspace,
  readWorkspaceMeta,
  writeWorkspaceMeta,
  workspaceDir,
  OptimisticLockError,
  writeKnowledgeSnapshot,
  readKnowledgeSnapshot,
  writeConflictMarker,
  readConflictMarkers,
} from '../lib/contextdb/workspace.mjs';

test('initWorkspace creates meta.json with version 1', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    const result = await initWorkspace(tmpDir);
    assert.equal(result.created, true);
    assert.equal(result.meta.schemaVersion, 1);
    assert.equal(result.meta.workspaceVersion, 1);
    assert.equal(result.meta.projectName, 'aios');
    assert(result.meta.lastUpdatedAt);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('initWorkspace is idempotent — returns existing meta if already initialized', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    const first = await initWorkspace(tmpDir);
    assert.equal(first.created, true);

    const second = await initWorkspace(tmpDir);
    assert.equal(second.created, false);
    assert.equal(second.meta.workspaceVersion, 1);
    assert.equal(first.meta.lastUpdatedAt, second.meta.lastUpdatedAt);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('writeWorkspaceMeta increments version on write', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    await initWorkspace(tmpDir);

    const updated = await writeWorkspaceMeta(tmpDir, { lastUpdatedBy: 'test-agent' });
    assert.equal(updated.workspaceVersion, 2);
    assert.equal(updated.lastUpdatedBy, 'test-agent');

    const read = await readWorkspaceMeta(tmpDir);
    assert.equal(read.workspaceVersion, 2);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('writeWorkspaceMeta rejects stale writes with OptimisticLockError', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    await initWorkspace(tmpDir);

    await writeWorkspaceMeta(tmpDir, { lastUpdatedBy: 'agent-1' });

    assert.rejects(
      () => writeWorkspaceMeta(tmpDir, { expectedVersion: 1, lastUpdatedBy: 'agent-2' }),
      (err) => {
        assert(err instanceof OptimisticLockError);
        assert.equal(err.expected, 1);
        assert.equal(err.actual, 2);
        return true;
      }
    );
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('writeKnowledgeSnapshot and readKnowledgeSnapshot round-trip', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    await initWorkspace(tmpDir);
    const snapshot = {
      generatedAt: new Date().toISOString(),
      categories: [{ name: 'cat1' }, { name: 'cat2' }],
      items: [{ name: 'item1' }, { name: 'item2' }]
    };
    await writeKnowledgeSnapshot(tmpDir, snapshot);
    const result = await readKnowledgeSnapshot(tmpDir);
    assert.equal(result.categories.length, 2);
    assert.equal(result.items[0].name, 'item1');
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('readKnowledgeSnapshot returns null when no snapshot exists', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    await initWorkspace(tmpDir);
    const result = await readKnowledgeSnapshot(tmpDir);
    assert.equal(result, null);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});
