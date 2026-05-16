import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  resolveAiosStateRoot,
  resolveContextDbRoot,
  resolveContextDbPath,
  resolveTasksRoot,
  toWorkspaceRelative,
} from '../lib/aios/state-root.mjs';

test('defaults runtime state to .aios under workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-'));

  assert.equal(resolveAiosStateRoot(root), path.join(root, '.aios'));
  assert.equal(resolveContextDbRoot(root), path.join(root, '.aios', 'context-db'));
  assert.equal(resolveContextDbPath(root, 'index.json'), path.join(root, '.aios', 'context-db', 'index.json'));
  assert.equal(resolveTasksRoot(root), path.join(root, '.aios', 'tasks'));
  assert.equal(toWorkspaceRelative(root, path.join(root, '.aios', 'context-db', 'index.json')), '.aios/context-db/index.json');
});

test('legacy ContextDB root can be selected for existing reads only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-legacy-'));
  await mkdir(path.join(root, 'memory', 'context-db'), { recursive: true });

  assert.equal(resolveContextDbRoot(root, { preferLegacyExisting: true }), path.join(root, 'memory', 'context-db'));
  assert.equal(resolveContextDbRoot(root), path.join(root, '.aios', 'context-db'));
});

test('env override can place project state outside the default .aios root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-env-'));
  const custom = path.join(root, '.custom-aios-state');
  const env = { AIOS_PROJECT_STATE_DIR: custom };

  assert.equal(resolveAiosStateRoot(root, { env }), custom);
  assert.equal(resolveContextDbRoot(root, { env }), path.join(custom, 'context-db'));
  assert.equal(toWorkspaceRelative(root, path.join(custom, 'context-db')), '.custom-aios-state/context-db');
});

test('ContextDB registry writes into .aios and advertises dotdir sources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-registry-dotdir-'));
  const { writeIndex, registryPath } = await import('../lib/contextdb/context-registry.mjs');

  const result = await writeIndex({
    sessionId: 'session-1',
    status: 'running',
    agent: 'codex-cli',
    workspaceRoot: root,
  });

  assert.equal(registryPath(root), path.join(root, '.aios', 'context-db', 'index.json'));
  assert.equal(result.path, path.join(root, '.aios', 'context-db', 'index.json'));
  assert.equal(result.index.sources.every((source) => !source.path.startsWith('memory/context-db')), true);
});

test('workspace memory session writes under .aios context db', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-workspace-memory-dotdir-'));
  const { ensureWorkspaceMemorySession, workspaceMemoryPinnedPath, workspaceMemoryStatePath } = await import('../lib/memo/workspace-memory.mjs');

  const result = ensureWorkspaceMemorySession(root);

  assert.equal(result.dir, path.join(root, '.aios', 'context-db', 'sessions', 'workspace-memory--default'));
  assert.equal(workspaceMemoryStatePath(root), path.join(root, '.aios', 'context-db', '.workspace-memory.json'));
  assert.equal(workspaceMemoryPinnedPath(root, 'workspace-memory--default'), path.join(root, '.aios', 'context-db', 'sessions', 'workspace-memory--default', 'pinned.md'));
});

test('workspace memory keeps legacy state together when only legacy context db exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-workspace-memory-legacy-'));
  await mkdir(path.join(root, 'memory', 'context-db'), { recursive: true });
  const { ensureWorkspaceMemorySession, workspaceMemoryPinnedPath, workspaceMemoryStatePath } = await import('../lib/memo/workspace-memory.mjs');

  const result = ensureWorkspaceMemorySession(root);

  assert.equal(result.dir, path.join(root, 'memory', 'context-db', 'sessions', 'workspace-memory--default'));
  assert.equal(workspaceMemoryStatePath(root), path.join(root, 'memory', 'context-db', '.workspace-memory.json'));
  assert.equal(workspaceMemoryPinnedPath(root, 'workspace-memory--default'), path.join(root, 'memory', 'context-db', 'sessions', 'workspace-memory--default', 'pinned.md'));
});
