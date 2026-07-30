import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { spawnCommand, spawnCommandWithInput } from '../lib/platform/process.mjs';

async function waitForExit(pid, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

test('spawnCommandWithInput settles timed-out shell shims and reaps their worker', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-spawn-timeout-'));
  try {
    const workerPath = path.join(rootDir, 'worker.mjs');
    const pidPath = path.join(rootDir, 'worker.pid');
    await fs.writeFile(workerPath, [
      "import fs from 'node:fs';",
      `fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid), 'utf8');`,
      "process.stdout.write('ready\\n');",
      'setInterval(() => {}, 1000);',
    ].join('\n'), 'utf8');

    const isWindows = process.platform === 'win32';
    const command = isWindows ? path.join(rootDir, 'hang.cmd') : process.execPath;
    const args = isWindows ? [] : [workerPath];
    if (isWindows) {
      await fs.writeFile(command, `@echo off\r\nnode "${workerPath}" %*\r\n`, 'utf8');
    }

    const startedAt = Date.now();
    const result = await spawnCommandWithInput(command, args, {
      input: '',
      timeoutMs: 750,
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.timedOut, true);
    assert.match(result.stdout, /ready/);
    assert.ok(elapsedMs < 3000, `timeout settled after ${elapsedMs}ms`);

    const pid = Number.parseInt(await fs.readFile(pidPath, 'utf8'), 10);
    assert.equal(Number.isInteger(pid) && pid > 0, true);
    assert.equal(await waitForExit(pid), true);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('spawnCommand settles a timed-out direct child', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-spawn-timeout-direct-'));
  try {
    const workerPath = path.join(rootDir, 'worker.mjs');
    const pidPath = path.join(rootDir, 'worker.pid');
    await fs.writeFile(workerPath, [
      "import fs from 'node:fs';",
      `fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid), 'utf8');`,
      "process.stdout.write('ready\\n');",
      'setInterval(() => {}, 1000);',
    ].join('\n'), 'utf8');

    const startedAt = Date.now();
    const result = await spawnCommand(process.execPath, [workerPath], { timeoutMs: 750 });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.timedOut, true);
    assert.match(result.stdout, /ready/);
    assert.ok(elapsedMs < 3000, `timeout settled after ${elapsedMs}ms`);

    const pid = Number.parseInt(await fs.readFile(pidPath, 'utf8'), 10);
    assert.equal(Number.isInteger(pid) && pid > 0, true);
    assert.equal(await waitForExit(pid), true);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
