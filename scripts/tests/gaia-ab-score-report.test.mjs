import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isGaiaAnswerCorrect,
  summarizeGaiaScores,
} from '../lib/gaia-ab-eval/scorer.mjs';
import { buildGaiaAbReports } from '../lib/gaia-ab-eval/report.mjs';

function answer(taskId, level, expected, actual) {
  return { taskId, level, expected, actual };
}

function run(client, model, baseline, optimized) {
  return {
    client,
    model,
    arms: { baseline, optimized },
  };
}

test('GAIA scorer compares numbers, lists, and normalized strings', () => {
  assert.equal(isGaiaAnswerCorrect('1000', '$1,000.0%'), true);
  assert.equal(isGaiaAnswerCorrect('alpha, beta', 'alpha; beta'), true);
  assert.equal(isGaiaAnswerCorrect('A complicated-answer.', 'a complicated answer!'), true);
  assert.equal(isGaiaAnswerCorrect('cost $100', 'cost 100'), true);
  assert.equal(isGaiaAnswerCorrect('different answer', 'expected answer'), false);
});

test('GAIA scorer returns an inspectable overall and level breakdown', () => {
  const summary = summarizeGaiaScores([
    answer('task-l1', 1, 'correct', 'correct'),
    answer('task-l2', 2, 'correct', 'wrong'),
    answer('task-l3', 3, 'correct', 'correct'),
  ]);

  assert.deepEqual(summary, {
    overall: { correct: 2, total: 3, accuracy: 2 / 3 },
    byLevel: {
      1: { correct: 1, total: 1, accuracy: 1 },
      2: { correct: 0, total: 1, accuracy: 0 },
      3: { correct: 1, total: 1, accuracy: 1 },
    },
  });
});

test('GAIA A/B reports remain paired and isolated by client and model', () => {
  const reports = buildGaiaAbReports([
    run(
      'codex',
      'gpt-5.6-terra',
      [
        answer('shared-l1', 1, 'yes', 'no'),
        answer('shared-l2', 2, 'yes', 'yes'),
        answer('shared-l3', 3, 'yes', 'no'),
      ],
      [
        answer('shared-l1', 1, 'yes', 'yes'),
        answer('shared-l2', 2, 'yes', 'no'),
        answer('shared-l3', 3, 'yes', 'no'),
      ],
    ),
    run(
      'claude',
      'claude-sonnet-5',
      [answer('claude-l1', 1, 'yes', 'yes')],
      [answer('claude-l1', 1, 'yes', 'yes')],
    ),
  ]);

  assert.deepEqual(
    reports.map(({ client, model }) => ({ client, model })),
    [
      { client: 'codex', model: 'gpt-5.6-terra' },
      { client: 'claude', model: 'claude-sonnet-5' },
    ],
  );
  assert.equal(Object.hasOwn(reports, 'aggregateAccuracy'), false);
  assert.deepEqual(reports[0].paired, {
    improved: 1,
    regressed: 1,
    bothCorrect: 0,
    bothIncorrect: 1,
  });
  assert.equal(reports[0].conclusion.status, 'inconclusive');
});

test('GAIA score and report artifacts reject hidden data-quality errors', () => {
  assert.throws(
    () => summarizeGaiaScores([
      answer('duplicate', 1, 'yes', 'yes'),
      answer('duplicate', 1, 'yes', 'yes'),
    ]),
    /duplicate.*taskId/iu,
  );
  assert.throws(
    () => summarizeGaiaScores([answer('unknown-level', 4, 'yes', 'yes')]),
    /level/iu,
  );
  assert.throws(
    () => buildGaiaAbReports([
      run(
        'hermes',
        'deepseek-v4-pro',
        [answer('baseline-only', 1, 'yes', 'yes')],
        [answer('optimized-only', 1, 'yes', 'yes')],
      ),
    ]),
    /task.*set/iu,
  );
});
