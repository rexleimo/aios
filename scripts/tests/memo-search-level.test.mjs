import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(here, '..', 'aios.mjs');

async function withRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-search-level-'));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function runMemo(rootDir, args) {
  return spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '' },
  });
}

const LONG_TEXT = `level proof body ${'detail-word '.repeat(80)}`;

test('search summary level truncates rows and reports an observable pack footer', async () => {
  await withRoot(async (rootDir) => {
    const add = runMemo(rootDir, ['add', LONG_TEXT]);
    assert.equal(add.status, 0, add.stderr || add.stdout);
    const found = runMemo(rootDir, ['search', 'level proof', '--level', 'summary']);
    assert.equal(found.status, 0, found.stderr || found.stdout);
    const lines = String(found.stdout || '').split(/\r?\n/u).filter(Boolean);
    const footer = lines.find((line) => line.startsWith('pack:'));
    assert.ok(footer, `expected a pack footer in:\n${found.stdout}`);
    assert.match(footer, /pack: 1 entries, \d+ chars, level=summary/u);
    const body = lines.filter((line) => !line.startsWith('pack:')).join('\n');
    assert.ok(body.length <= 600, `summary body must stay small, got ${body.length}`);
    assert.ok(!body.includes('detail-word detail-word detail-word detail-word detail-word detail-word'), 'summary must not leak full text');
  });
});

test('search full level keeps the legacy complete rows plus a pack footer', async () => {
  await withRoot(async (rootDir) => {
    const add = runMemo(rootDir, ['add', LONG_TEXT]);
    assert.equal(add.status, 0, add.stderr || add.stdout);
    const found = runMemo(rootDir, ['search', 'level proof', '--level', 'full']);
    assert.equal(found.status, 0, found.stderr || found.stdout);
    assert.match(String(found.stdout || ''), /pack: 1 entries, \d+ chars, level=full/u);
    assert.ok(String(found.stdout || '').includes('detail-word'), 'full level must keep complete text');
  });
});

test('search default level stays backward compatible and still reports pack size', async () => {
  await withRoot(async (rootDir) => {
    const add = runMemo(rootDir, ['add', 'plain default level note']);
    assert.equal(add.status, 0, add.stderr || add.stdout);
    const found = runMemo(rootDir, ['search', 'plain default']);
    assert.equal(found.status, 0, found.stderr || found.stdout);
    assert.match(String(found.stdout || ''), /plain default level note/u);
    assert.match(String(found.stdout || ''), /pack: 1 entries, \d+ chars, level=full/u);
  });
});
