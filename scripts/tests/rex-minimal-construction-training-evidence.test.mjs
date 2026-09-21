import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTrainingEvidence } from '../lib/skills/training-evidence-validator.mjs';

/*
 * Hermetic replacement for the retired `.skillopt/rex-minimal-construction-2026-07-18`
 * fixture (2026-09-21, v6.0.5).
 *
 * That directory is gitignored, so the original assertions could only ever run
 * inside a developer's worktree and went red the moment the file was wired into
 * the regression suite (CI and every release build start from a clean checkout).
 * Its `steps/step_0001/gate_result.json` (`action: reject_train_regression`) and
 * `state.json` (`canonicalAction: retain_baseline`) were recorded output of an
 * external SkillOpt trainer: no code in this repository produces or consumes
 * those fields, so asserting them here tested dead data, not a contract.
 *
 * The reachable contract is the production validator, so the trade-off the old
 * fixture documented — a candidate that buys validation quality by giving up
 * train quality — is now expressed through it.
 */

const TASKS = Object.freeze([
  { id: 'train-alpha', split: 'train', assertions: ['returns the documented shape'] },
  { id: 'train-beta', split: 'train', assertions: ['rejects the invalid input'] },
  { id: 'validation-alpha', split: 'validation', assertions: ['handles the held-out case'] },
  { id: 'validation-beta', split: 'validation', assertions: ['preserves the held-out contract'] },
]);

const EVIDENCE_QUOTE = 'observed in the isolated target response';

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Build one raw/scored artifact pair whose hard scores are exactly the ones the
 * validator re-derives from the assertions, so a well-formed run validates.
 */
function buildRun(runId, passes) {
  const results = TASKS.map((task) => {
    const passed = passes[task.id];
    const assertions = task.assertions.map((name) => ({
      name,
      passed,
      evidenceQuote: passed ? EVIDENCE_QUOTE : '',
      rationale: passed
        ? 'the isolated target response contains the required evidence'
        : 'the isolated target response lacks the required evidence',
    }));
    const passedCount = assertions.filter((entry) => entry.passed).length;
    return {
      id: task.id,
      split: task.split,
      assertions,
      hard: passedCount === assertions.length ? 1 : 0,
      soft: passedCount / assertions.length,
    };
  });

  const train = results.filter((result) => result.split === 'train').map((result) => result.hard);
  const validation = results.filter((result) => result.split === 'validation').map((result) => result.hard);

  return {
    raw: {
      runId,
      results: TASKS.map((task) => ({ id: task.id, targetResponse: `target output ${EVIDENCE_QUOTE}` })),
    },
    scored: {
      runId,
      results,
      summary: {
        trainHard: mean(train),
        validationHard: mean(validation),
        overallHard: mean([...train, ...validation]),
      },
    },
  };
}

test('rex-minimal-construction：留出集收益不能抵消训练集回退', () => {
  const control = buildRun('control-run', {
    'train-alpha': false,
    'train-beta': false,
    'validation-alpha': false,
    'validation-beta': false,
  });
  const baseline = buildRun('baseline-run', {
    'train-alpha': true,
    'train-beta': true,
    'validation-alpha': false,
    'validation-beta': false,
  });
  const candidate = buildRun('candidate-run', {
    'train-alpha': true,
    'train-beta': false,
    'validation-alpha': true,
    'validation-beta': true,
  });

  const metrics = {};
  for (const [key, run] of [['control', control], ['baseline', baseline], ['candidate', candidate]]) {
    const report = validateTrainingEvidence({ tasks: TASKS, raw: run.raw, scored: run.scored });
    assert.equal(report.valid, true, `${key}: ${JSON.stringify(report.violations)}`);
    metrics[key] = report.metrics;
  }

  // The documented hazard: the candidate wins the held-out split outright.
  assert.ok(
    metrics.candidate.validationHard > metrics.baseline.validationHard,
    'the candidate must improve the validation split',
  );

  // ...while giving back train quality, which is why the trade is not progress.
  assert.ok(
    metrics.candidate.trainHard < metrics.baseline.trainHard,
    'the candidate must regress the train split',
  );

  // An overall-only reading would still look like an improvement, so a caller
  // that checks `overallHard` alone would accept the regression. Asserting that
  // explicitly keeps the trap documented rather than implied.
  assert.ok(
    metrics.candidate.overallHard > metrics.baseline.overallHard,
    'the overall metric must be the misleading one in this trade-off',
  );
});
