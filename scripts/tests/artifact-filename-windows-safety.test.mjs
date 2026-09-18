/**
 * Test scope contract (rex-test-design)
 * -------------------------------------
 * Behavior under test: an artifact whose file name is derived from an entity id
 * must never contain a character a Windows file name cannot represent.
 *
 * Observable seams (no internal poking):
 *   - `sanitizeFileSegment` return value
 *   - `atomicTempPath` return value
 *   - real files that `writeVerdict` / `writeFileAtomic` leave on disk
 *
 * Why it matters: `candidateId` is legitimately `session:<sessionId>`
 * (evolution-integration.test.mjs asserts that shape). On NTFS the name
 * `session:eval-001.json` is parsed as an alternate data stream, so the create
 * appears to succeed and the following rename fails with EINVAL — the defect
 * that this test pins down on POSIX as well, where it cannot reproduce.
 *
 * Out of scope: reserved device names (CON, NUL) and long-path behavior.
 */
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { atomicTempPath, writeFileAtomic } from '../lib/fs/atomic-write.mjs';
import { sanitizeFileSegment } from '../lib/fs/file-segment.mjs';
import { createVerdict, readVerdict, writeVerdict } from '../lib/lifecycle/evolution/verdict.mjs';
import {
  createPromotion,
  listPromotions,
  readPromotion,
  writePromotion,
} from '../lib/lifecycle/evolution/promotion.mjs';

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/;

const GOOD_CHECKS = {
  schema: 'pass',
  safety: 'pass',
  scope: 'pass',
  functional: 'pass',
  tests: 'pass',
  holdout: 'pass',
  regression: 'pass',
};

const GOOD_METRICS = {
  baselineSuccessRate: 0.70,
  candidateSuccessRate: 0.85,
  baselineAvgTokens: 10000,
  candidateAvgTokens: 9600,
  baselineUserCorrections: 4,
  candidateUserCorrections: 2,
};

async function withWorkspace(prefix, fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('sanitizeFileSegment removes only characters a file name cannot hold', () => {
  assert.equal(sanitizeFileSegment('session:eval-001'), 'session-eval-001');
  assert.equal(sanitizeFileSegment('a<b>c"d/e\\f|g?h*i'), 'a-b-c-d-e-f-g-h-i');
  // The value is otherwise left intact: no lowercasing, no separator rewriting.
  assert.equal(sanitizeFileSegment('Session_Eval-001.v2'), 'Session_Eval-001.v2');
  assert.equal(sanitizeFileSegment(''), '');
});

test('atomicTempPath never derives a name a Windows volume would misread', () => {
  const target = path.join(os.tmpdir(), 'verdicts', 'session:eval-001.json');
  const tempPath = atomicTempPath(target);
  assert.equal(ILLEGAL.test(path.basename(tempPath)), false, path.basename(tempPath));
  // The temp file stays a sibling so the rename remains atomic on one volume.
  assert.equal(path.dirname(tempPath), path.dirname(target));
  assert.ok(path.basename(tempPath).endsWith('.tmp'));
});

test('writeVerdict keeps a colon-bearing candidateId out of the file name', async () => {
  await withWorkspace('aios-verdict-name-', async (root) => {
    const candidateId = 'session:eval-001';
    const written = await writeVerdict(root, createVerdict({
      candidateId,
      baselineVersion: 'skill-v3',
      candidateVersion: 'skill-v4',
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
      evidenceRefs: ['ev-001'],
    }));

    // The id is data and keeps its shape.
    assert.equal(written.candidateId, candidateId);

    const dir = path.join(root, '.aios', 'memo', 'evolution', 'verdicts');
    const names = await fs.readdir(dir);
    assert.equal(names.length, 1);
    assert.equal(ILLEGAL.test(names[0]), false, names[0]);
    assert.equal(names.some((name) => name.includes(':')), false);

    // Reading back by the unsanitized id resolves to the same artifact.
    const readBack = await readVerdict(root, candidateId);
    assert.equal(readBack.candidateId, candidateId);
  });
});

test('writeFileAtomic reports a failure instead of leaving a temp file behind', async () => {
  await withWorkspace('aios-atomic-cleanup-', async (root) => {
    // A directory is never a legal rename target, so the write must fail after
    // the temp file has already been created.
    const target = path.join(root, 'not-a-file');
    await fs.mkdir(target);
    await assert.rejects(() => writeFileAtomic(target, 'nope\n'));
    assert.deepEqual((await fs.readdir(root)).filter((name) => name.endsWith('.tmp')), []);
  });
});

test('a promotion for a colon-bearing candidateId stays visible on disk', async () => {
  await withWorkspace('aios-promotion-name-', async (root) => {
    const candidateId = 'session:session-import-0';
    await writePromotion(root, createPromotion({ candidateId }));

    const dir = path.join(root, '.aios', 'memo', 'evolution', 'promotions');
    const names = await fs.readdir(dir);
    assert.deepEqual(names, ['session-session-import-0.json']);

    // The record must be reachable through the store's own readers: a path that
    // only the writer knows is how the promotion got lost on Windows before.
    const listed = await listPromotions(root);
    assert.equal(listed.length, 1, 'promotion must be listed, not stored as a stream');
    assert.equal((await readPromotion(root, candidateId)).candidateId, candidateId);
  });
});
