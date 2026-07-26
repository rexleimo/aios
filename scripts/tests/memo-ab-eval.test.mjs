import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ARMS,
  EVAL_CHAINS,
  buildCorpusEvents,
  formatReport,
  runArm,
} from '../lib/memo/eval/recall-ab.mjs';

async function withTempRoot(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memo-ab-eval-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function arm(name) {
  return withTempRoot((root) => runArm(root, name));
}

test('the corpus differs between arms only by its supersede links', () => {
  const plain = buildCorpusEvents({ withLinks: false });
  const linked = buildCorpusEvents({ withLinks: true });

  assert.equal(plain.length, linked.length);
  for (let index = 0; index < plain.length; index += 1) {
    assert.deepEqual(
      { ...linked[index], supersedes: undefined },
      { ...plain[index], supersedes: undefined },
      'only the supersedes field may differ, otherwise a metric delta is not attributable',
    );
  }
  assert.ok(linked.some((event) => Array.isArray(event.supersedes) && event.supersedes.length > 0));
  assert.ok(plain.every((event) => event.supersedes === undefined));
});

test('baseline recall hands the agent both the retired fact and its replacement', async () => {
  const result = await arm('baseline');
  assert.equal(result.overall.contradictionRate, 1, 'every fact chain should contradict itself without links');
  assert.ok(result.overall.staleRate > 0.4);
  assert.ok(result.overall.top1Accuracy < 1, 'a better-indexed stale note should outrank its replacement');
});

test('explicit supersede links remove contradictions entirely', async () => {
  const result = await arm('temporal-explicit');
  assert.equal(result.overall.contradictionRate, 0);
  assert.equal(result.overall.staleRate, 0);
  assert.equal(result.overall.top1Accuracy, 1);
  assert.equal(result.overall.avgReturned, 1, 'exactly one live revision per chain should survive');
});

test('explicit links shrink the recall payload against the baseline', async () => {
  const [baseline, explicit] = await Promise.all([arm('baseline'), arm('temporal-explicit')]);
  assert.ok(explicit.overall.avgChars < baseline.overall.avgChars);
  assert.ok(explicit.overall.avgReturned < baseline.overall.avgReturned);
});

test('the automatic detector covers only a minority of the chains', async () => {
  const result = await arm('temporal-auto');
  // Recorded as a measurement, not an aspiration: Jaccard word overlap only
  // recognizes rewordings, so most real revisions go undetected.
  assert.ok(result.autoProposals > 0, 'the detector should find something');
  assert.ok(result.autoProposals < EVAL_CHAINS.length / 2, 'and should not be mistaken for full coverage');
  assert.ok(result.overall.contradictionRate > 0.5);
});

test('Chinese revisions are detectable now that tokenization handles unspaced scripts', async () => {
  const result = await arm('temporal-auto');
  // Was 100% before character-bigram tokenization: whitespace splitting turned
  // every Chinese sentence into one token, so no pair could clear the
  // threshold. Partial, not solved — a reworded pair clears 0.82, a pair whose
  // differing characters are clustered does not.
  assert.ok(
    result.bySegment.cjk.contradictionRate < 1,
    'at least one Chinese fact chain should now be retired automatically',
  );
});

test('the ablation is deterministic across runs', async () => {
  const [first, second] = await Promise.all([arm('temporal-explicit'), arm('temporal-explicit')]);
  assert.deepEqual(first.overall, second.overall);
  assert.deepEqual(first.perChain, second.perChain);
});

test('formatReport renders one row per arm', async () => {
  const results = [];
  for (const name of ARMS) results.push(await arm(name));
  const report = formatReport(results);
  for (const name of ARMS) assert.match(report, new RegExp(`\\| ${name} \\|`, 'u'));
});
