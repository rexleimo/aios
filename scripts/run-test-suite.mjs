import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { suiteSpec, createTempSandbox, disposeTempSandbox } from './lib/tooling/test-suite-runner.mjs';

async function testFiles(roots) {
  const files = [];
  for (const root of roots) {
    for await (const entry of walk(root)) {
      if (entry.endsWith('.test.mjs')) files.push(entry);
    }
  }
  return files.sort();
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(target);
    else if (entry.isFile()) yield target;
  }
}

const suiteName = process.argv[2] || 'regression';
const suite = suiteSpec(suiteName);
const files = suite.files || await testFiles(suite.roots);
if (files.length === 0) throw new Error(`No test files found for suite: ${suiteName}`);

const startedAt = performance.now();
// 中文注释：本轮运行的临时沙箱由 runner 创建并在退出时删除；测试文件无需自觉回收。
const sandbox = createTempSandbox();
const child = spawn(process.execPath, ['--test', `--test-concurrency=${suite.concurrency}`, ...files], {
  windowsHide: true,
  stdio: 'inherit',
  env: sandbox.env,
});
child.once('exit', (code, signal) => {
  const cleanup = disposeTempSandbox(sandbox.dir);
  if (signal) process.kill(process.pid, signal);
  else {
    const cleanupNote = sandbox.disabled
      ? 'temp_sandbox=disabled'
      : cleanup.removed
        ? `temp_sandbox=removed`
        : `temp_sandbox=KEPT@${cleanup.dir}${cleanup.error ? ` (${cleanup.error})` : ''} -> npm run tmp:gc`;
    process.stderr.write(`\n[test-suite] ${suiteName}: files=${files.length}, concurrency=${suite.concurrency}, elapsed_ms=${Math.round(performance.now() - startedAt)}, ${cleanupNote}\n`);
    process.exitCode = code ?? 1;
  }
});
