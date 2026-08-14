import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectTurnRecall, shouldCollectTurnRecall } from '../lib/planning/turn-recall.mjs';

test('turn recall only runs for planned or resume turns', () => {
  assert.equal(shouldCollectTurnRecall({ disposition: 'direct' }), false);
  assert.equal(shouldCollectTurnRecall({ disposition: 'guarded' }), false);
  assert.equal(shouldCollectTurnRecall({ disposition: 'planned' }), true);
  assert.equal(shouldCollectTurnRecall({ continuation: 'explicit-resume' }), true);
});

test('turn recall fails open when the workspace has no ContextDB', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-recall-'));
  try {
    const text = await collectTurnRecall({
      rootDir,
      message: '继续做结账验收',
      decision: { disposition: 'planned' },
    });
    assert.match(text, /## AIOS RECALL/u);
    assert.match(text, /contextdb:/u);
    assert.match(text, /ccrg:/u);
    assert.doesNotMatch(text, /Call get_minimal_context/u);
    assert.match(text, /ccrg: (queried|unavailable|skipped)/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('turn recall invokes a CCRG graph query instead of a snapshot hint', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-recall-ccrg-'));
  try {
    let queried = null;
    const text = await collectTurnRecall({
      rootDir,
      message: '继续改 checkout validation',
      decision: { disposition: 'planned' },
      queryCcrg: async (input) => {
        queried = input;
        return {
          status: 'queried',
          nodeCount: 12,
          hits: [{ qualifiedName: 'validateCheckout', filePath: 'scripts/lib/checkout.mjs', kind: 'function' }],
        };
      },
    });
    assert.equal(queried.rootDir, rootDir);
    assert.match(queried.query, /checkout validation/u);
    assert.match(text, /ccrg: queried/u);
    assert.match(text, /validateCheckout/u);
    assert.doesNotMatch(text, /Call get_minimal_context/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
