import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  resolveAiosStateRoot,
  resolveContextDbRoot,
  resolveContextDbPath,
  resolveMemoRoot,
  resolveMemoPath,
  resolveTasksRoot,
  resolveWorkspaceStateRoot,
  toWorkspaceRelative,
} from '../lib/aios/state-root.mjs';

test('defaults runtime state to .aios under workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-'));

  assert.equal(resolveAiosStateRoot(root), path.join(root, '.aios'));
  assert.equal(resolveContextDbRoot(root), path.join(root, '.aios', 'context-db'));
  assert.equal(resolveContextDbPath(root, 'index.json'), path.join(root, '.aios', 'context-db', 'index.json'));
  assert.equal(resolveMemoRoot(root), path.join(root, '.aios', 'memo'));
  assert.equal(resolveMemoPath(root, 'file', 'events.jsonl'), path.join(root, '.aios', 'memo', 'file', 'events.jsonl'));
  assert.equal(resolveTasksRoot(root), path.join(root, '.aios', 'tasks'));
  assert.equal(resolveWorkspaceStateRoot(root), path.join(root, '.aios', 'workspace'));
  assert.equal(toWorkspaceRelative(root, path.join(root, '.aios', 'context-db', 'index.json')), '.aios/context-db/index.json');
});

test('legacy ContextDB root can be selected for existing reads only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-legacy-'));
  await mkdir(path.join(root, 'memory', 'context-db'), { recursive: true });

  assert.equal(resolveContextDbRoot(root, { preferLegacyExisting: true }), path.join(root, 'memory', 'context-db'));
  assert.equal(resolveContextDbRoot(root), path.join(root, '.aios', 'context-db'));
});

test('legacy workspace state root can be selected for existing reads only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-workspace-legacy-'));
  await mkdir(path.join(root, 'memory', 'workspace'), { recursive: true });

  assert.equal(resolveWorkspaceStateRoot(root, { preferLegacyExisting: true }), path.join(root, 'memory', 'workspace'));
  assert.equal(resolveWorkspaceStateRoot(root), path.join(root, '.aios', 'workspace'));
});

test('env override can place project state outside the default .aios root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-state-root-env-'));
  const custom = path.join(root, '.custom-aios-state');
  const env = { AIOS_PROJECT_STATE_DIR: custom };

  assert.equal(resolveAiosStateRoot(root, { env }), custom);
  assert.equal(resolveContextDbRoot(root, { env }), path.join(custom, 'context-db'));
  assert.equal(resolveMemoRoot(root, { env }), path.join(custom, 'memo'));
  assert.equal(resolveWorkspaceStateRoot(root, { env }), path.join(custom, 'workspace'));
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

test('workspace memory writes new state under .aios even when legacy context db exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-workspace-memory-legacy-'));
  await mkdir(path.join(root, 'memory', 'context-db'), { recursive: true });
  const { ensureWorkspaceMemorySession, workspaceMemoryPinnedPath, workspaceMemoryStatePath } = await import('../lib/memo/workspace-memory.mjs');

  const result = ensureWorkspaceMemorySession(root);

  assert.equal(result.dir, path.join(root, '.aios', 'context-db', 'sessions', 'workspace-memory--default'));
  assert.equal(workspaceMemoryStatePath(root), path.join(root, '.aios', 'context-db', '.workspace-memory.json'));
  assert.equal(workspaceMemoryPinnedPath(root, 'workspace-memory--default'), path.join(root, '.aios', 'context-db', 'sessions', 'workspace-memory--default', 'pinned.md'));
});
