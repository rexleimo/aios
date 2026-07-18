import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const TRAINING_ROOT = path.join(ROOT, '.skillopt', 'rex-workflow-2026-07-17');

async function readText(...segments) {
  return readFile(path.join(...segments), 'utf8');
}

async function readJson(...segments) {
  return JSON.parse(await readText(...segments));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} !== ${expected}`);
}

function assertScoredRun({
  rawText,
  scoredText,
  skillText,
  evalText,
  tasks,
  expectedTrainHard,
  expectedValidationHard,
}) {
  const raw = JSON.parse(rawText);
  const scored = JSON.parse(scoredText);
  const evals = JSON.parse(evalText).evals;
  const expectedIds = tasks.map((task) => task.id);

  assert.equal(raw.runner, 'codex-subagent-isolated');
  assert.equal(scored.scorer, 'codex-subagent-isolated-independent');
  assert.equal(raw.runId, scored.runId);
  assert.equal(raw.skillSha256, sha256(skillText));
  assert.equal(scored.skillSha256, sha256(skillText));
  assert.equal(raw.evalSha256, sha256(evalText));
  assert.equal(scored.evalSha256, sha256(evalText));
  assert.equal(scored.sourceOutputSha256, sha256(rawText));
  assert.deepEqual(raw.results.map((result) => result.id), expectedIds);
  assert.deepEqual(scored.results.map((result) => result.id), expectedIds);

  const rawById = new Map(raw.results.map((result) => [result.id, result]));
  const scoredById = new Map(scored.results.map((result) => [result.id, result]));
  for (const task of tasks) {
    const rawResult = rawById.get(task.id);
    const scoredResult = scoredById.get(task.id);
    const evalDefinition = evals.find((entry) => entry.id === task.evalId);
    assert.equal(rawResult.evalId, task.evalId);
    assert.equal(rawResult.prompt, evalDefinition.prompt);
    assert.ok(rawResult.targetResponse.trim().length > 0);
    assert.equal(scoredResult.evalId, task.evalId);
    assert.deepEqual(scoredResult.assertions.map((entry) => entry.name), task.assertions);

    for (const assertionResult of scoredResult.assertions) {
      assert.ok(assertionResult.rationale.trim().length > 0);
      if (assertionResult.passed) {
        assert.ok(assertionResult.evidenceQuote.trim().length > 0);
        assert.ok(rawResult.targetResponse.includes(assertionResult.evidenceQuote));
      }
    }
    const passedCount = scoredResult.assertions.filter((entry) => entry.passed).length;
    assert.equal(scoredResult.hard, passedCount === scoredResult.assertions.length ? 1 : 0);
    assertClose(scoredResult.soft, passedCount / scoredResult.assertions.length, `${task.id} soft score`);
  }

  const train = scored.results.filter((result) => result.split === 'train');
  const validation = scored.results.filter((result) => result.split === 'validation');
  const trainHard = mean(train.map((result) => result.hard));
  const validationHard = mean(validation.map((result) => result.hard));
  assertClose(trainHard, expectedTrainHard, 'train hard');
  assertClose(validationHard, expectedValidationHard, 'validation hard');
  assertClose(scored.summary.trainHard, trainHard, 'summary train hard');
  assertClose(scored.summary.validationHard, validationHard, 'summary validation hard');
  assertClose(scored.summary.overallHard, mean(scored.results.map((result) => result.hard)), 'summary overall hard');

  return { raw, scored, trainHard, validationHard };
}

test('accepted rex-workflow SkillOpt evidence matches the canonical Skill and strict two-step gate', async () => {
  const [canonical, best, candidateV1, candidateV2, state, step1Gate, step2Gate] = await Promise.all([
    readText(ROOT, 'rex-harness', 'skill-sources', 'rex-workflow', 'SKILL.md'),
    readText(TRAINING_ROOT, 'best_skill.md'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0001.md'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0002.md'),
    readJson(TRAINING_ROOT, 'state.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0001', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0002', 'gate_result.json'),
  ]);

  const acceptedHash = sha256(canonical);
  assert.equal(best, canonical);
  assert.equal(candidateV2, canonical);
  assert.notEqual(candidateV1, canonical);
  assert.equal(state.status, 'accepted');
  assert.equal(state.nonRegression, true);
  assert.equal(state.bestStep, 2);
  assert.equal(state.acceptedSkillHash, acceptedHash);
  assert.equal(step1Gate.action, 'reject_regression');
  assert.equal(step1Gate.non_regression, false);
  assert.equal(step1Gate.candidate_hash, sha256(candidateV1));
  assert.ok(step1Gate.candidate_train_hard < step1Gate.baseline_train_hard);
  assert.equal(step2Gate.action, 'accept_new_best');
  assert.equal(step2Gate.candidate_hash, acceptedHash);
  assert.equal(step2Gate.non_regression, true);
  assert.ok(step2Gate.candidate_hard > step2Gate.current_hard);
  assert.ok(step2Gate.candidate_train_hard >= step2Gate.baseline_train_hard);
});

test('isolated raw outputs and independent assertion scores are complete and reproducible', async () => {
  const [
    oldSkill,
    currentSkill,
    evalText,
    train,
    valid,
    baselineRaw,
    baselineScored,
    step1Raw,
    step1Scored,
    step2Raw,
    step2Scored,
  ] = await Promise.all([
    readText(TRAINING_ROOT, 'skills', 'skill_v0000.md'),
    readText(ROOT, 'rex-harness', 'skill-sources', 'rex-workflow', 'SKILL.md'),
    readText(ROOT, 'rex-harness', 'skill-sources', 'rex-workflow', 'evals', 'evals.json'),
    readJson(TRAINING_ROOT, 'tasks', 'train.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid.json'),
    readText(TRAINING_ROOT, 'baseline_raw_outputs_isolated.json'),
    readText(TRAINING_ROOT, 'baseline_assertion_results_isolated.json'),
    readText(TRAINING_ROOT, 'candidate_raw_outputs_isolated.json'),
    readText(TRAINING_ROOT, 'candidate_assertion_results_isolated.json'),
    readText(TRAINING_ROOT, 'candidate_v2_raw_outputs_isolated.json'),
    readText(TRAINING_ROOT, 'candidate_v2_assertion_results_isolated.json'),
  ]);
  const tasks = [...train, ...valid];

  assert.equal(train.length, 10);
  assert.equal(valid.length, 5);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 15);

  const baseline = assertScoredRun({
    rawText: baselineRaw,
    scoredText: baselineScored,
    skillText: oldSkill,
    evalText,
    tasks,
    expectedTrainHard: 1,
    expectedValidationHard: 0.8,
  });
  const step1 = assertScoredRun({
    rawText: step1Raw,
    scoredText: step1Scored,
    skillText: await readText(TRAINING_ROOT, 'skills', 'skill_v0001.md'),
    evalText,
    tasks,
    expectedTrainHard: 0.9,
    expectedValidationHard: 1,
  });
  const step2 = assertScoredRun({
    rawText: step2Raw,
    scoredText: step2Scored,
    skillText: currentSkill,
    evalText,
    tasks,
    expectedTrainHard: 1,
    expectedValidationHard: 1,
  });

  assert.ok(step1.validationHard > baseline.validationHard);
  assert.ok(step1.trainHard < baseline.trainHard, 'step 1 must expose the regression that rejected it');
  assert.ok(step2.validationHard > baseline.validationHard);
  assert.ok(step2.trainHard >= baseline.trainHard);
});

test('rollout summaries are derived from the isolated scoring artifacts', async () => {
  const [baseline, step1, step2, step1Raw, step1Scored, step2Raw, step2Scored, state] = await Promise.all([
    readJson(TRAINING_ROOT, 'baseline_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0001', 'rollout_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0002', 'rollout_results.json'),
    readText(TRAINING_ROOT, 'candidate_raw_outputs_isolated.json'),
    readText(TRAINING_ROOT, 'candidate_assertion_results_isolated.json'),
    readText(TRAINING_ROOT, 'candidate_v2_raw_outputs_isolated.json'),
    readText(TRAINING_ROOT, 'candidate_v2_assertion_results_isolated.json'),
    readJson(TRAINING_ROOT, 'state.json'),
  ]);

  assert.equal(step1.rawOutputs.sha256, sha256(step1Raw));
  assert.equal(step1.assertionResults.sha256, sha256(step1Scored));
  assert.equal(step2.rawOutputs.sha256, sha256(step2Raw));
  assert.equal(step2.assertionResults.sha256, sha256(step2Scored));
  assert.equal(step1.runId, JSON.parse(step1Raw).runId);
  assert.equal(step1.runId, JSON.parse(step1Scored).runId);
  assert.equal(step2.runId, JSON.parse(step2Raw).runId);
  assert.equal(step2.runId, JSON.parse(step2Scored).runId);
  assert.deepEqual(step1.results.map((result) => result.id), step2.results.map((result) => result.id));
  assertClose(step1.trainHard, mean(step1.results.filter((result) => result.split === 'train').map((result) => result.hard)), 'step 1 train hard');
  assertClose(step2.validationHard, mean(step2.results.filter((result) => result.split === 'validation').map((result) => result.hard)), 'step 2 validation hard');
  assert.equal(baseline.currentSkill.train.hardScore, state.metrics.baselineTrainHard);
  assert.equal(baseline.currentSkill.validation.hardScore, state.metrics.baselineValidationHard);
  assert.equal(step2.trainHard, state.metrics.trainHard);
  assert.equal(step2.validationHard, state.metrics.validationHard);
});
