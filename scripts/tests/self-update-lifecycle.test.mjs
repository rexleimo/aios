import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensureWorkingDirectoryOutsideInstallTree, updateHarnessRuntime } from '../lib/lifecycle/self-update.mjs';

// 中文注释：macOS 的 TMPDIR（/var/...）是符号链接，chdir 后 process.cwd() 返回
// 解析路径（/private/var/...）；temp 根必须先 realpath，否则与库内 path.resolve 比较不一致。
const TMP_BASE = await realpath(os.tmpdir());

function fakeRunner({ statusStdout = '' } = {}) {
  const calls = [];
  const run = async (command, args, options = {}) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    if (key === 'git status --porcelain') return { stdout: statusStdout, stderr: '' };
    return { stdout: '', stderr: '' };
  };
  run.calls = calls;
  return run;
}

test('ensureWorkingDirectoryOutsideInstallTree moves cwd out of the install tree', async () => {
  const root = await mkdtemp(path.join(TMP_BASE, 'aios-selfupdate-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    const logs = [];
    const moved = ensureWorkingDirectoryOutsideInstallTree(root, { log: (line) => logs.push(line) });

    assert.equal(moved, true);
    assert.notEqual(process.cwd(), root);
    assert.equal(process.cwd().startsWith(root + path.sep), false);
    assert.equal(logs.some((line) => line.includes('moved working directory out of install tree')), true);
  } finally {
    process.chdir(previousCwd);
  }
});

test('ensureWorkingDirectoryOutsideInstallTree moves cwd when inside a subdirectory of the install tree', async () => {
  const root = await mkdtemp(path.join(TMP_BASE, 'aios-selfupdate-'));
  const nested = path.join(root, 'scripts');
  await mkdir(nested, { recursive: true });
  const previousCwd = process.cwd();
  try {
    process.chdir(nested);
    const moved = ensureWorkingDirectoryOutsideInstallTree(root, { log: () => {} });

    assert.equal(moved, true);
    assert.equal(process.cwd().startsWith(root + path.sep), false);
  } finally {
    process.chdir(previousCwd);
  }
});

test('ensureWorkingDirectoryOutsideInstallTree keeps cwd when already outside', async () => {
  const root = await mkdtemp(path.join(TMP_BASE, 'aios-selfupdate-'));
  const previousCwd = process.cwd();
  try {
    const moved = ensureWorkingDirectoryOutsideInstallTree(root, { log: () => {} });

    assert.equal(moved, false);
    assert.equal(process.cwd(), previousCwd);
  } finally {
    process.chdir(previousCwd);
  }
});

test('git-path self-update syncs the rex-harness submodule worktree after pull', async () => {
  const root = await mkdtemp(path.join(TMP_BASE, 'aios-selfupdate-'));
  await mkdir(path.join(root, '.git'), { recursive: true });
  const run = fakeRunner();
  const logs = [];

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: (line) => logs.push(line), error: () => {} },
    runCommandImpl: run,
  });

  assert.equal(result.method, 'git');
  assert.equal(result.updated, true);
  assert.equal(result.submodulesSynced, true);
  assert.deepEqual(run.calls, [
    'git status --porcelain',
    'git pull --ff-only',
    'git submodule update --init --recursive',
  ]);
});

test('git-path self-update skips all mutations when the worktree is dirty', async () => {
  const root = await mkdtemp(path.join(TMP_BASE, 'aios-selfupdate-'));
  await mkdir(path.join(root, '.git'), { recursive: true });
  const run = fakeRunner({ statusStdout: ' M scripts/aios.mjs\n' });

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: () => {}, error: () => {} },
    runCommandImpl: run,
  });

  assert.equal(result.skipped, true);
  assert.deepEqual(run.calls, ['git status --porcelain']);
});

test('install-tree self-update uses the release installer and never git commands', async () => {
  const root = await mkdtemp(path.join(TMP_BASE, 'aios-selfupdate-'));
  const run = fakeRunner();

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: () => {}, error: () => {} },
    runCommandImpl: run,
  });

  assert.equal(result.method, 'release-installer');
  assert.equal(result.updated, true);
  assert.equal(run.calls.filter((key) => key.startsWith('git ')).length, 0);
  if (process.platform === 'win32') {
    assert.equal(run.calls[0].startsWith('powershell '), true);
  } else {
    assert.equal(run.calls[0].startsWith('bash -lc curl -fsSL https://github.com/'), true);
  }
});
