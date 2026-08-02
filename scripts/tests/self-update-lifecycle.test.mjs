import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensureWorkingDirectoryOutsideInstallTree } from '../lib/lifecycle/self-update.mjs';

test('ensureWorkingDirectoryOutsideInstallTree moves cwd out of the install tree', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-selfupdate-'));
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
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-selfupdate-'));
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
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-selfupdate-'));
  const previousCwd = process.cwd();
  try {
    const moved = ensureWorkingDirectoryOutsideInstallTree(root, { log: () => {} });

    assert.equal(moved, false);
    assert.equal(process.cwd(), previousCwd);
  } finally {
    process.chdir(previousCwd);
  }
});
