import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildRecallQueries, collectTurnRecall, collectTurnRecallResult, inferUsefulRecallEventIds, shouldCollectTurnRecall } from '../lib/planning/turn-recall.mjs';

test('recall query ladder starts verbatim and adds content-word + token rungs', () => {
  const ladders = buildRecallQueries('Continue the checkout validation work in order-service');
  assert.equal(ladders[0], 'Continue the checkout validation work in order-service');
  assert.ok(ladders.length >= 3, `expected >= 3 ladder rungs, got ${ladders.length}`);
  // The content-word rung surfaces the recall-bearing terms (no stop-word table).
  assert.match(ladders[1], /checkout/u);
  assert.match(ladders[1], /validation/u);
});

test('recall query ladder keeps short prompts as single content query', () => {
  assert.deepEqual(buildRecallQueries(''), []);
  assert.deepEqual(buildRecallQueries('hi'), ['hi']);
  assert.deepEqual(buildRecallQueries('deploy'), ['deploy']);
});

test('turn recall collects for every meaningful turn and only skips noop', () => {
  assert.equal(shouldCollectTurnRecall({ disposition: 'direct' }), true);
  assert.equal(shouldCollectTurnRecall({ disposition: 'guarded' }), true);
  assert.equal(shouldCollectTurnRecall({ disposition: 'planned' }), true);
  assert.equal(shouldCollectTurnRecall({ continuation: 'explicit-resume' }), true);
  assert.equal(shouldCollectTurnRecall({ disposition: 'noop' }), false);
  assert.equal(shouldCollectTurnRecall(null), false);
  assert.equal(shouldCollectTurnRecall({}), false);
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

test('turn recall injects text only on hits while keeping an observable block', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-recall-nohit-'));
  try {
    const result = await collectTurnRecallResult({
      rootDir,
      message: 'completely unmatched recall probe zqxv-9871',
      decision: { disposition: 'direct' },
    });
    // No hits: nothing is prepended to the prompt (text stays empty)...
    assert.equal(result.text, '');
    assert.equal(result.hits, 0);
    // ...but the status block keeps recall observable for hook consumers.
    assert.match(result.block, /## AIOS RECALL/u);
    assert.match(result.block, /hits: 0/u);
    assert.doesNotMatch(result.block, /query:/u);
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

test('turn recall recalls a memo written by a previous session across sessions', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-turn-recall-xsession-'));
  try {
    // Session 1 state: one agent-private memo about a completed fix.
    const fs = await import('node:fs/promises');
    await fs.mkdir(path.join(rootDir, '.aios/memo/file'), { recursive: true });
    await fs.writeFile(path.join(rootDir, '.aios/memo/file/events.jsonl'), `${JSON.stringify({
      eventId: 'memo:default:cross-1',
      schemaVersion: 1,
      kind: 'memo',
      space: 'default',
      text: 'Task: Fix the checkout validation regression in order-service Result: Fixed the checkout validation bug by tightening input checks. Tests pass.',
      refs: ['contextdb:e2e-oneshot-001#x'],
      scope: 'agent_private',
      agent: 'codex-cli',
      claimStatus: 'verified',
      ts: new Date().toISOString(),
    })}\n`, 'utf8');

    // Session 2 turn: a natural-language follow-up must recall session 1's memo
    // even though the prompt never appears verbatim in the stored text.
    const result = await collectTurnRecallResult({
      rootDir,
      message: 'Continue the checkout validation work in order-service',
      decision: { disposition: 'direct' },
      sessionId: 'e2e-oneshot-002',
      agent: 'codex-cli',
    });
    assert.equal(result.hits > 0, true, `expected cross-session hit, got hits=${result.hits} reason=${result.reason}`);
    assert.ok(result.results.some((hit) => hit.source === 'memory' && String(hit.text).includes('checkout validation')));
    assert.match(result.text, /## AIOS RECALL/u);
    assert.match(result.text, /memory/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('useful adoption is driven by the agent memory declaration, not token overlap', () => {
  const results = [
    { eventId: 'memo:default:a', source: 'memory', text: 'mkdocs nav is hardcoded; register new posts.' },
    { eventId: 'memo:default:b', source: 'memory', text: 'deploy logs at server/logs/deploy.log' },
    { eventId: 'ctx:other', source: 'contextdb', text: 'not a memo' },
  ];
  // Agent declares it used event a only.
  const declared = inferUsefulRecallEventIds({
    results,
    response: 'Fixed the nav.\n<!--memory: verified=yes, useful=memo:default:a -->',
  });
  assert.deepEqual(declared, ['memo:default:a']);
  // Declaring an eventId that was NOT recalled this turn is ignored.
  const phantom = inferUsefulRecallEventIds({
    results,
    response: 'Fixed it.\n<!--memory: verified=yes, useful=memo:default:ghost -->',
  });
  assert.deepEqual(phantom, []);
  // No declaration block => nothing marked useful, regardless of text overlap.
  const noDecl = inferUsefulRecallEventIds({
    results,
    response: 'mkdocs nav is hardcoded; register new posts. deploy logs at server/logs/deploy.log',
  });
  assert.deepEqual(noDecl, []);
});
