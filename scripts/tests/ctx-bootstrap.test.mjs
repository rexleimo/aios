import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensureBootstrapTask, isBootstrapEnabled } from '../ctx-bootstrap.mjs';

async function createWorkspace(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('creates bootstrap task when no current task and no pending tasks', async () => {
  const workspace = await createWorkspace('aios-bootstrap-');

  const result = await ensureBootstrapTask(workspace, {
    project: 'demo-app',
    agent: 'codex-cli',
    now: new Date('2026-03-05T01:02:03.000Z'),
  });

  assert.equal(result.created, true);
  assert.equal(result.reason, undefined);
  assert.match(result.taskId, /^task_20260305T010203_bootstrap_guidelines$/);

  const taskDir = path.join(workspace, '.aios', 'tasks', 'pending', result.taskId);
  const taskJsonPath = path.join(taskDir, 'task.json');
  const prdPath = path.join(taskDir, 'prd.md');
  const currentTaskPath = path.join(workspace, '.aios', 'tasks', '.current-task');

  assert.equal(existsSync(taskJsonPath), true);
  assert.equal(existsSync(prdPath), true);
  assert.equal(existsSync(currentTaskPath), true);
  assert.equal(existsSync(path.join(workspace, 'tasks')), false);

  const taskJson = JSON.parse(await readFile(taskJsonPath, 'utf8'));
  assert.equal(taskJson.id, result.taskId);
  assert.equal(taskJson.status, 'pending');
  assert.equal(taskJson.type, 'analysis');

  const currentTask = (await readFile(currentTaskPath, 'utf8')).trim();
  assert.equal(currentTask, `pending/${result.taskId}/task.json`);
});

test('skips bootstrap when legacy tasks/.current-task already exists', async () => {
  const workspace = await createWorkspace('aios-bootstrap-current-');
  const tasksDir = path.join(workspace, 'tasks');
  await mkdir(tasksDir, { recursive: true });
  await writeFile(path.join(tasksDir, '.current-task'), 'pending/existing/task.json\n', 'utf8');

  const result = await ensureBootstrapTask(workspace, {
    project: 'demo-app',
    now: new Date('2026-03-05T01:02:03.000Z'),
  });

  assert.equal(result.created, false);
  assert.equal(result.reason, 'current-task-exists');
});

test('skips bootstrap when pending already has tasks', async () => {
  const workspace = await createWorkspace('aios-bootstrap-pending-');
  const pendingDir = path.join(workspace, 'tasks', 'pending');
  await mkdir(pendingDir, { recursive: true });
  await writeFile(path.join(pendingDir, 'existing.json'), '{}\n', 'utf8');

  const result = await ensureBootstrapTask(workspace, {
    project: 'demo-app',
    now: new Date('2026-03-05T01:02:03.000Z'),
  });

  assert.equal(result.created, false);
  assert.equal(result.reason, 'pending-has-tasks');
});

test('skips bootstrap when .aios/tasks/.current-task already exists', async () => {
  const workspace = await createWorkspace('aios-bootstrap-dotdir-current-');
  const tasksDir = path.join(workspace, '.aios', 'tasks');
  await mkdir(tasksDir, { recursive: true });
  await writeFile(path.join(tasksDir, '.current-task'), 'pending/existing/task.json\n', 'utf8');

  const result = await ensureBootstrapTask(workspace, {
    project: 'demo-app',
    now: new Date('2026-03-05T01:02:03.000Z'),
  });

  assert.equal(result.created, false);
  assert.equal(result.reason, 'current-task-exists');
});

test('isBootstrapEnabled supports env opt-out switches', () => {
  assert.equal(isBootstrapEnabled({}), true);
  assert.equal(isBootstrapEnabled({ AIOS_BOOTSTRAP_AUTO: '1' }), true);
  assert.equal(isBootstrapEnabled({ AIOS_BOOTSTRAP_AUTO: '0' }), false);
  assert.equal(isBootstrapEnabled({ AIOS_BOOTSTRAP_AUTO: 'false' }), false);
  assert.equal(isBootstrapEnabled({ AIOS_BOOTSTRAP_AUTO: 'off' }), false);
  assert.equal(isBootstrapEnabled({ AIOS_BOOTSTRAP_AUTO: 'FALSE' }), false);
});
