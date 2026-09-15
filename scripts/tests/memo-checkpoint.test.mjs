import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'scripts', 'aios.mjs');

function runMemo(workspaceRoot, args) {
  return spawnSync('node', [cliPath, 'memo', ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
}

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('memo checkpoint appends a [checkpoint] entry to pinned workspace memory', async () => {
  await withWorkspace('aios-memo-checkpoint-', async (workspaceRoot) => {
    const result = runMemo(workspaceRoot, ['checkpoint', 'v5.15 release verified green']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Checkpoint pinned/i);

    const pinnedPath = path.join(workspaceRoot, '.aios', 'memo', 'file', 'pinned', 'default.md');
    const content = await fs.readFile(pinnedPath, 'utf8');
    assert.match(content, /\[checkpoint\] v5\.15 release verified green/u);
  });
});

test('memo checkpoint appends with blank-line separation, never rewrites history', async () => {
  await withWorkspace('aios-memo-checkpoint-append-', async (workspaceRoot) => {
    assert.equal(runMemo(workspaceRoot, ['pin', 'set', 'baseline rule']).status, 0);
    assert.equal(runMemo(workspaceRoot, ['checkpoint', 'first milestone']).status, 0);
    assert.equal(runMemo(workspaceRoot, ['checkpoint', 'second milestone']).status, 0);

    const pinnedPath = path.join(workspaceRoot, '.aios', 'memo', 'file', 'pinned', 'default.md');
    const content = await fs.readFile(pinnedPath, 'utf8');
    assert.match(content, /^baseline rule\n\n\[checkpoint\] first milestone\n\n\[checkpoint\] second milestone\n$/u);
  });
});

test('memo checkpoint surfaces through pin show and rejects empty text', async () => {
  await withWorkspace('aios-memo-checkpoint-show-', async (workspaceRoot) => {
    const missing = runMemo(workspaceRoot, ['checkpoint']);
    assert.notEqual(missing.status, 0);
    assert.match(`${missing.stderr}${missing.stdout}`, /Usage: memo checkpoint/u);

    assert.equal(runMemo(workspaceRoot, ['checkpoint', 'landed fix for login bug']).status, 0);
    const show = runMemo(workspaceRoot, ['pin', 'show']);
    assert.equal(show.status, 0);
    assert.match(show.stdout, /\[checkpoint\] landed fix for login bug/u);
  });
});
