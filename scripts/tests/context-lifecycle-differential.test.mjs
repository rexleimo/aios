import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCleanEvaluator,
  resolveImmutableCommit,
} from '../benchmarks/context-lifecycle-v1-differential.mjs';

function git(rootDir, args) {
  const result = spawnSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || '').trim();
}

async function withGitRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'context-lifecycle-differential-'));
  try {
    git(rootDir, ['init']);
    git(rootDir, ['config', 'user.email', 'context-lifecycle@example.invalid']);
    git(rootDir, ['config', 'user.name', 'Context Lifecycle Test']);
    await writeFile(path.join(rootDir, 'fixture.txt'), 'baseline\n', 'utf8');
    git(rootDir, ['add', '.']);
    git(rootDir, ['commit', '-m', 'baseline']);
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('immutable differential helpers resolve commits only from a clean evaluator root', async () => {
  await withGitRoot(async (rootDir) => {
    const head = git(rootDir, ['rev-parse', 'HEAD']);
    assert.equal(assertCleanEvaluator(rootDir), head);
    assert.equal(resolveImmutableCommit(rootDir, 'HEAD'), head);

    await writeFile(path.join(rootDir, 'untracked.txt'), 'dirty\n', 'utf8');
    assert.throws(() => assertCleanEvaluator(rootDir), /must be clean/u);
    assert.throws(() => resolveImmutableCommit(rootDir, 'does-not-exist'), /git rev-parse/u);
  });
});
