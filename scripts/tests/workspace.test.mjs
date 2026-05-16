import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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
  buildAgentView,
} from '../lib/contextdb/workspace.mjs';

test('initWorkspace creates meta.json with version 1', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    const result = await initWorkspace(tmpDir);
    assert.equal(result.created, true);
    assert.equal(workspaceDir(tmpDir), path.join(tmpDir, '.aios', 'workspace'));
    await stat(path.join(tmpDir, '.aios', 'workspace', 'meta.json'));
    await assert.rejects(() => stat(path.join(tmpDir, 'memory', 'workspace')));
    assert.equal(result.meta.schemaVersion, 1);
    assert.equal(result.meta.workspaceVersion, 1);
    assert.equal(result.meta.projectName, 'aios');
    assert(result.meta.lastUpdatedAt);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('workspaceDir reads existing legacy memory/workspace only when dotdir state is absent', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-legacy-'));
  try {
    await mkdir(path.join(tmpDir, 'memory', 'workspace'), { recursive: true });
    await writeFile(
      path.join(tmpDir, 'memory', 'workspace', 'meta.json'),
      `${JSON.stringify({ schemaVersion: 1, workspaceVersion: 7, projectName: 'legacy' })}\n`,
      'utf8'
    );

    assert.equal(workspaceDir(tmpDir), path.join(tmpDir, 'memory', 'workspace'));
    const meta = await readWorkspaceMeta(tmpDir);
    assert.equal(meta.workspaceVersion, 7);
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

test('writeConflictMarker creates a conflict file and readConflictMarkers lists it', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    await initWorkspace(tmpDir);
    const conflict = {
      file: '.aios/workspace/meta.json',
      expectedVersion: 1,
      actualVersion: 2,
      attemptedBy: 'agent-x',
      attemptedAt: new Date().toISOString(),
    };
    await writeConflictMarker(tmpDir, conflict);
    const markers = await readConflictMarkers(tmpDir);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].file, conflict.file);
    assert.equal(markers[0].expectedVersion, 1);
    assert.equal(markers[0].actualVersion, 2);
    assert.equal(markers[0].attemptedBy, 'agent-x');
    assert.ok(markers[0].detectedAt);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('readConflictMarkers returns empty array when no conflicts', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    await initWorkspace(tmpDir);
    const markers = await readConflictMarkers(tmpDir);
    assert.deepEqual(markers, []);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('buildAgentView assembles view from workspace and session data', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    await initWorkspace(tmpDir);
    const { writeSkillIndex } = await import('../lib/contextdb/skill-index.mjs');
    await writeSkillIndex(tmpDir, {
      skills: [
        { name: '发布笔记', file: 'memory/skills/发布笔记.json', keywords: ['发布'], taskTypes: ['content-publish'], version: 1 },
      ],
    });

    const view = await buildAgentView(tmpDir, 'test-session', 'content-publish');
    assert.equal(view.sessionId, 'test-session');
    assert.equal(view.workspaceVersion, 1);
    assert.ok(typeof view.projectContext === 'string');
    assert.equal(view.relevantSkills.length, 1);
    assert.equal(view.relevantSkills[0].name, '发布笔记');
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});

test('buildAgentView with missing workspace returns default view', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
  try {
    const view = await buildAgentView(tmpDir, 'test-session');
    assert.equal(view.sessionId, 'test-session');
    assert.equal(view.workspaceVersion, 0);
    assert.deepEqual(view.relevantSkills, []);
    assert.equal(view.continuity, null);
  } finally {
    await rm(tmpDir, { recursive: true });
  }
});
