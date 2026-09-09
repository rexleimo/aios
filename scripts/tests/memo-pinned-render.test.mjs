import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PINNED_DEFAULT_MAX_CHARS,
  renderPinnedBlock,
} from '../lib/memo/storage/pinned.mjs';

test('render numbers lines and reports margin metadata', () => {
  const rendered = renderPinnedBlock('first\nsecond\nthird');
  assert.equal(rendered.lines.length, 3);
  assert.deepEqual(rendered.lines.map((line) => line.no), [1, 2, 3]);
  assert.equal(rendered.lines[0].text, 'first');
  assert.equal(rendered.truncated, false);
  assert.equal(rendered.chars + rendered.remaining, rendered.maxChars);
  assert.ok(rendered.chars > 0 && rendered.remaining > 0);
});

test('over-limit content truncates and demands explicit tidy', () => {
  const rendered = renderPinnedBlock('x'.repeat(PINNED_DEFAULT_MAX_CHARS + 100), {
    maxChars: PINNED_DEFAULT_MAX_CHARS,
  });
  assert.equal(rendered.truncated, true);
  assert.equal(rendered.remaining, 0);
  assert.ok(rendered.chars <= PINNED_DEFAULT_MAX_CHARS);
});

test('custom limits clamp to the allowed range', () => {
  const tiny = renderPinnedBlock('hello', { maxChars: 1 });
  assert.equal(tiny.maxChars, 512);
  const huge = renderPinnedBlock('hello', { maxChars: 10 ** 9 });
  assert.equal(huge.maxChars, 20000);
});

test('empty content renders zero lines with full margin', () => {
  const rendered = renderPinnedBlock('');
  assert.deepEqual(rendered.lines, []);
  assert.equal(rendered.chars, 0);
  assert.equal(rendered.remaining, rendered.maxChars);
  assert.equal(rendered.truncated, false);
});

test('pin status reports the usage triple from the CLI', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cliPath = path.resolve(here, '..', 'aios.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-pin-status-'));
  const runMemo = (args) => spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '' },
  });
  try {
    const set = runMemo(['pin', 'set', 'status probe']);
    assert.equal(set.status, 0, set.stderr || set.stdout);
    const status = runMemo(['pin', 'status']);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    assert.match(String(status.stdout || ''), /pinned default: 13\/\d+ chars, remaining \d+$/um);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
