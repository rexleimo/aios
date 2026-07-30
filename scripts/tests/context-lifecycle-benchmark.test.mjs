import assert from 'node:assert/strict';
import test from 'node:test';

import { compareBenchmarkResults } from '../benchmarks/context-lifecycle-v1-compare.mjs';

function result(profile, runnerSha256, scenarios) {
  return {
    kind: 'context-lifecycle-v1-benchmark-result',
    profile,
    runnerSha256,
    passed: true,
    gitCommit: profile === 'baseline' ? 'baseline-commit' : 'post-commit',
    total: scenarios.length,
    targetMetCount: scenarios.filter((scenario) => scenario.targetMet).length,
    scenarios,
  };
}

test('same-runner comparison accepts explicit baseline N/A scenarios', () => {
  const baseline = result('baseline', 'same-runner', [
    { id: 'CL-01', targetMet: false, expectedTargetMet: false },
    { id: 'CL-10', targetMet: false, expectedTargetMet: null },
  ]);
  const post = result('s2', 'same-runner', [
    { id: 'CL-01', targetMet: true, expectedTargetMet: true },
    { id: 'CL-10', targetMet: true, expectedTargetMet: true },
  ]);

  const comparison = compareBenchmarkResults({ baseline, post });

  assert.equal(comparison.passed, true);
  assert.deepEqual(comparison.comparableScenarioIds, ['CL-01']);
  assert.deepEqual(comparison.notApplicableScenarioIds, ['CL-10']);
  assert.deepEqual(comparison.improvedScenarioIds, ['CL-01']);
  assert.equal(comparison.evidenceBoundary.independentOracle, false);
  assert.equal(comparison.evidenceBoundary.realProjectSamples, 0);
});

test('same-runner comparison rejects mismatched runners and scenario sets', () => {
  const baseline = result('baseline', 'baseline-runner', [
    { id: 'CL-01', targetMet: false, expectedTargetMet: false },
  ]);
  const post = result('s2', 'post-runner', [
    { id: 'CL-02', targetMet: true, expectedTargetMet: true },
  ]);

  const comparison = compareBenchmarkResults({ baseline, post });

  assert.equal(comparison.passed, false);
  assert.ok(comparison.errors.includes('baseline and post results were not produced by the same runner'));
  assert.ok(comparison.errors.includes('baseline and post scenarios differ'));
});
