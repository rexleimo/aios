import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectBootstrapTask } from '../doctor-bootstrap-task.mjs';

async function makeWs(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('warns when tasks directory is missing', async () => {
  const ws = await makeWs('aios-doctor-bootstrap-missing-');
  const result = await inspectBootstrapTask(ws);
  assert.equal(result.status, 'warn');
  assert.equal(result.code, 'tasks-missing');
});

test('ok when .aios/tasks/.current-task points to existing task file', async () => {
  const ws = await makeWs('aios-doctor-bootstrap-current-ok-');
  const taskDir = path.join(ws, '.aios', 'tasks', 'pending', 'task_1_bootstrap_guidelines');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'task.json'), '{}\n', 'utf8');
  await writeFile(path.join(ws, '.aios', 'tasks', '.current-task'), 'pending/task_1_bootstrap_guidelines/task.json\n', 'utf8');

  const result = await inspectBootstrapTask(ws);
  assert.equal(result.status, 'ok');
  assert.equal(result.code, 'current-task-present');
  assert.match(result.message, /^current task pointer is valid: \.aios\/tasks\//);
});

test('warns when .aios/tasks/.current-task points to missing file', async () => {
  const ws = await makeWs('aios-doctor-bootstrap-current-broken-');
  await mkdir(path.join(ws, '.aios', 'tasks'), { recursive: true });
  await writeFile(path.join(ws, '.aios', 'tasks', '.current-task'), 'pending/missing/task.json\n', 'utf8');

  const result = await inspectBootstrapTask(ws);
  assert.equal(result.status, 'warn');
  assert.equal(result.code, 'current-task-broken');
  assert.match(result.message, /^\.aios\/tasks\/\.current-task points to missing file:/);
});

test('warns when .aios/tasks pending is empty and there is no current task', async () => {
  const ws = await makeWs('aios-doctor-bootstrap-empty-');
  await mkdir(path.join(ws, '.aios', 'tasks', 'pending'), { recursive: true });

  const result = await inspectBootstrapTask(ws);
  assert.equal(result.status, 'warn');
  assert.equal(result.code, 'pending-empty');
  assert.match(result.message, /\.aios\/tasks\/pending is empty/);
});

test('warns when bootstrap task exists but current-task is missing', async () => {
  // Contract set by the c85a51c3 doctor/ctx-bootstrap split: guideline entries
  // pending without a pointer report `pending-bootstrap`. The runtime reads
  // .current-task at startup (ctx-agent-core/startup-summary.mjs), so an
  // unpointed queue is warn-worthy in both shapes below.
  const ws = await makeWs('aios-doctor-bootstrap-orphan-');
  await mkdir(path.join(ws, '.aios', 'tasks', 'pending', 'task_abc_bootstrap_guidelines'), { recursive: true });

  const result = await inspectBootstrapTask(ws);
  assert.equal(result.status, 'warn');
  assert.equal(result.code, 'pending-bootstrap');
  assert.match(result.message, /pending has \d+ bootstrap entries/);
});

test('warns when pending has non-bootstrap tasks but no current-task pointer', async () => {
  const ws = await makeWs('aios-doctor-bootstrap-pending-stale-');
  await mkdir(path.join(ws, '.aios', 'tasks', 'pending', 'task_business_001'), { recursive: true });

  const result = await inspectBootstrapTask(ws);
  assert.equal(result.status, 'warn');
  assert.equal(result.code, 'pending-stale');
  assert.match(result.message, /non-bootstrap tasks but no current task/);
});

test('keeps legacy tasks readable when existing task queue is present', async () => {
  const ws = await makeWs('aios-doctor-bootstrap-legacy-');
  const taskDir = path.join(ws, 'tasks', 'pending', 'task_legacy_bootstrap_guidelines');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'task.json'), '{}\n', 'utf8');
  await writeFile(path.join(ws, 'tasks', '.current-task'), 'pending/task_legacy_bootstrap_guidelines/task.json\n', 'utf8');

  const result = await inspectBootstrapTask(ws);
  assert.equal(result.status, 'ok');
  assert.equal(result.code, 'current-task-present');
  assert.match(result.message, /^current task pointer is valid: tasks\//);
});
