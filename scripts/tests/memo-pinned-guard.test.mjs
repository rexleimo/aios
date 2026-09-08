import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendPinnedMemo,
  pinnedContentHash,
  readPinnedMemo,
  writePinnedMemo,
} from '../lib/memo/storage/pinned.mjs';

async function withTempRoot(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memo-pinned-guard-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('stale pinned write is rejected and asks for re-read', async () => {
  await withTempRoot(async (rootDir) => {
    const first = await writePinnedMemo(rootDir, { space: 'default', content: 'v1' });
    assert.match(first, /v1/u);
    const freshHash = pinnedContentHash(first);

    // Simulate a concurrent writer landing between our read and write.
    await writePinnedMemo(rootDir, { space: 'default', content: 'v2-concurrent' });

    await assert.rejects(
      writePinnedMemo(rootDir, { space: 'default', content: 'v3-stale', expectedHash: freshHash }),
      (error) => error?.code === 'AIOS_MEMO_PINNED_STALE',
      'stale writer must be rejected with AIOS_MEMO_PINNED_STALE',
    );

    // Re-read gives the new hash; writing with it succeeds.
    const current = await readPinnedMemo(rootDir, { space: 'default' });
    const recovered = await writePinnedMemo(rootDir, {
      space: 'default',
      content: 'v3-recovered',
      expectedHash: pinnedContentHash(current),
    });
    assert.match(recovered, /v3-recovered/u);
  });
});

test('writes without expected hash keep legacy blind-overwrite behavior', async () => {
  await withTempRoot(async (rootDir) => {
    await writePinnedMemo(rootDir, { space: 'default', content: 'a' });
    const next = await writePinnedMemo(rootDir, { space: 'default', content: 'b' });
    assert.match(next, /b/u);
  });
});

test('append honors the same stale guard', async () => {
  await withTempRoot(async (rootDir) => {
    const first = await writePinnedMemo(rootDir, { space: 'default', content: 'base' });
    const staleHash = pinnedContentHash(first);
    await writePinnedMemo(rootDir, { space: 'default', content: 'base + concurrent' });
    await assert.rejects(
      appendPinnedMemo(rootDir, { space: 'default', content: 'late addition', expectedHash: staleHash }),
      (error) => error?.code === 'AIOS_MEMO_PINNED_STALE',
    );
    const current = await readPinnedMemo(rootDir, { space: 'default' });
    const next = await appendPinnedMemo(rootDir, {
      space: 'default',
      content: 'late addition',
      expectedHash: pinnedContentHash(current),
    });
    assert.match(next, /late addition/u);
  });
});

test('pinned hash is stable for identical normalized content', () => {
  assert.equal(pinnedContentHash('x\n'), pinnedContentHash('x'));
  assert.notEqual(pinnedContentHash('x'), pinnedContentHash('y'));
});
