import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { verifySkillTrainingGate } from '../lib/skills/training-gate.mjs';

const ROOT = process.cwd();
const TRAINING_ROOT = path.join(ROOT, '.skillopt', 'rex-tdd-2026-07-17');
const CANONICAL_SKILL = path.join(ROOT, 'rex-harness', 'skill-sources', 'rex-tdd', 'SKILL.md');
const CANONICAL_EVAL = path.join(ROOT, 'rex-harness', 'skill-sources', 'rex-tdd', 'evals', 'evals.json');
const V2_SKILL_HASH = '4a9029076e8bfa3b93d4d4389eecf967aa0194caecf4d4489db9c0fef610b2ce';
const V3_SKILL_HASH = '21654eeaeead654be3afc27e13c513e83b753080e092f7f420c5684351e9cb9c';
const V1_EVAL_HASH = '6a7d5e4a34694497c10bcf26dfe72de9ec16df2ab3ca7ae27836805578ae8c29';
const HOLDOUT_PROPOSAL_HASH = '042c76e0791d3f9ddffab6a5a1207175fb06c9e6f8267a1f5c3ddd643bca0352';
const HOLDOUT_V3_PROPOSAL_HASH = '4c065d0c7210fb473b628ebff1a8636bc5921e784ec6ceaf2f4e519ebd2d8eb7';
const V3_EVAL_HASH = '2ca58094344cf6c2d8465b5c4c1056a8c8ad53865e6cf4ddae51dde72a9daf27';
const V4_SKILL_HASH = '9e40ba01147f4c1597e53cef9a13a4231b789fecd2d547ac1c585fe0fd461a12';
const HOLDOUT_V4_PROPOSAL_HASH = 'daa0e6e1ac7206ad4c796383920228c4f33fb2e3dd9998744bc2893b5bb0333c';
const V4_EVAL_HASH = '512af1d789162d621ba1e7f78b3028cfd45f6a2c616218c44817c351d8be0113';
const V5_SKILL_HASH = V4_SKILL_HASH;
const HOLDOUT_V5_PROPOSAL_HASH = 'be73e07943a4726994cd8bede99242d9e8815f52fd91d3be2325b00ceb27c219';
const V5_EVAL_HASH = '1842e2ddda0f7a9a87f4de0655e76e311aedfd3e9857db2a8dbc2530af1af65d';
const V6_SKILL_HASH = '0c3e8b73b726b62b024d1d4abc9c66c000e59d17cdb656aa4ab7d4be9ccd0e50';
const V7_SKILL_HASH = '52d8e79298f56c371e9adac9628e23339ef00795d6a83208beed817c3ed0506b';
const HOLDOUT_V6_PROPOSAL_HASH = 'b4edd07c07e1b65b10d592d79315f2fe6c93b58014de5b82363f6fb90e46f5d0';
const V6_EVAL_HASH = '052543902151eb8a9869d67cade5f13167738fca2efd9e509986648883d385a3';
const HOLDOUT_V7_PROPOSAL_HASH = '75640ea32cdf80866de32429698964c47bfe54ec23b45f788c969e1ae02855b5';
const V7_EVAL_HASH = '44fa67b2217044ecd98ddfbc3b617fd1c12bdb1bb3f47a974a6ef0b025fad1a4';

const RUNS = [
  {
    key: 'control',
    raw: 'no_guidance_v2_raw_outputs_isolated.json',
    scored: 'no_guidance_v2_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-no-guidance-v2.json'],
    scorerReceipt: ['receipts', 'scorer-no-guidance-v2.json'],
    skill: null,
    runner: 'codex-subagent-isolated-v2-no-guidance',
    scorer: 'codex-subagent-isolated-v2-scorer-no-guidance',
  },
  {
    key: 'baseline',
    raw: 'baseline_v2_raw_outputs_isolated.json',
    scored: 'baseline_v2_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-baseline-v2.json'],
    scorerReceipt: ['receipts', 'scorer-baseline-v2.json'],
    skill: ['skills', 'skill_v0000.md'],
    runner: 'codex-subagent-isolated-v2-baseline',
    scorer: 'codex-subagent-isolated-v2-scorer-baseline',
  },
  {
    key: 'candidate',
    raw: 'candidate_v2_raw_outputs_isolated.json',
    scored: 'candidate_v2_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-candidate-v2.json'],
    scorerReceipt: ['receipts', 'scorer-candidate-v2.json'],
    skill: ['skills', 'skill_v0002.md'],
    runner: 'codex-subagent-isolated-v2-candidate',
    scorer: 'codex-subagent-isolated-v2-scorer-candidate',
  },
];

const V3_RUNS = [
  {
    key: 'control',
    raw: 'no_guidance_v3_raw_outputs_isolated.json',
    scored: 'no_guidance_v3_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-no-guidance-v3.json'],
    scorerReceipt: ['receipts', 'scorer-no-guidance-v3.json'],
    skill: null,
    runner: 'codex-subagent-isolated-v3-no-guidance',
    scorer: 'codex-subagent-isolated-v3-scorer-no-guidance',
  },
  {
    key: 'baseline',
    raw: 'baseline_v3_raw_outputs_isolated.json',
    scored: 'baseline_v3_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-baseline-v3.json'],
    scorerReceipt: ['receipts', 'scorer-baseline-v3.json'],
    skill: ['skills', 'skill_v0000.md'],
    runner: 'codex-subagent-isolated-v3-baseline',
    scorer: 'codex-subagent-isolated-v3-scorer-baseline',
  },
  {
    key: 'candidate',
    raw: 'candidate_v3_raw_outputs_isolated.json',
    scored: 'candidate_v3_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-candidate-v3.json'],
    scorerReceipt: ['receipts', 'scorer-candidate-v3.json'],
    skill: ['skills', 'skill_v0003.md'],
    runner: 'codex-subagent-isolated-v3-candidate',
    scorer: 'codex-subagent-isolated-v3-scorer-candidate',
  },
];

const V4_RUNS = [
  {
    key: 'control',
    raw: 'no_guidance_v4_raw_outputs_isolated.json',
    scored: 'no_guidance_v4_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-no-guidance-v4.json'],
    scorerReceipt: ['receipts', 'scorer-no-guidance-v4.json'],
    skill: null,
    runner: 'codex-subagent-isolated-v4-control',
    scorer: 'codex-subagent-isolated-v4-scorer-control',
  },
  {
    key: 'baseline',
    raw: 'baseline_v4_raw_outputs_isolated.json',
    scored: 'baseline_v4_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-baseline-v4.json'],
    scorerReceipt: ['receipts', 'scorer-baseline-v4.json'],
    skill: ['skills', 'skill_v0000.md'],
    runner: 'codex-subagent-isolated-v4-baseline',
    scorer: 'codex-subagent-isolated-v4-scorer-baseline',
  },
  {
    key: 'candidate',
    raw: 'candidate_v4_raw_outputs_isolated.json',
    scored: 'candidate_v4_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-candidate-v4.json'],
    scorerReceipt: ['receipts', 'scorer-candidate-v4.json'],
    skill: ['skills', 'skill_v0004.md'],
    runner: 'codex-subagent-isolated-v4-candidate',
    scorer: 'codex-subagent-isolated-v4-scorer-candidate',
  },
];

const V5_RUNS = [
  {
    key: 'control',
    raw: 'no_guidance_v5_raw_outputs_isolated.json',
    scored: 'no_guidance_v5_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-no-guidance-v5.json'],
    scorerReceipt: ['receipts', 'scorer-no-guidance-v5.json'],
    skill: null,
    runner: 'codex-subagent-isolated-v5-control',
    scorer: 'codex-subagent-isolated-v5-scorer-control',
  },
  {
    key: 'baseline',
    raw: 'baseline_v5_raw_outputs_isolated.json',
    scored: 'baseline_v5_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-baseline-v5.json'],
    scorerReceipt: ['receipts', 'scorer-baseline-v5.json'],
    skill: ['skills', 'skill_v0000.md'],
    runner: 'codex-subagent-isolated-v5-baseline',
    scorer: 'codex-subagent-isolated-v5-scorer-baseline',
  },
  {
    key: 'candidate',
    raw: 'candidate_v5_raw_outputs_isolated.json',
    scored: 'candidate_v5_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-candidate-v5.json'],
    scorerReceipt: ['receipts', 'scorer-candidate-v5.json'],
    skill: ['skills', 'skill_v0005.md'],
    runner: 'codex-subagent-isolated-v5-candidate',
    scorer: 'codex-subagent-isolated-v5-scorer-candidate',
  },
];

const V6_RUNS = [
  {
    key: 'control',
    raw: 'no_guidance_v6_raw_outputs_isolated.json',
    scored: 'no_guidance_v6_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-no-guidance-v6.json'],
    scorerReceipt: ['receipts', 'scorer-no-guidance-v6.json'],
    skill: null,
    runner: 'codex-subagent-isolated-v6-control',
    scorer: 'codex-subagent-isolated-v6-scorer-control',
  },
  {
    key: 'baseline',
    raw: 'baseline_v6_raw_outputs_isolated.json',
    scored: 'baseline_v6_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-baseline-v6.json'],
    scorerReceipt: ['receipts', 'scorer-baseline-v6.json'],
    skill: ['skills', 'skill_v0000.md'],
    runner: 'codex-subagent-isolated-v6-baseline',
    scorer: 'codex-subagent-isolated-v6-scorer-baseline',
  },
  {
    key: 'candidate',
    raw: 'candidate_v6_raw_outputs_isolated.json',
    scored: 'candidate_v6_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-candidate-v6.json'],
    scorerReceipt: ['receipts', 'scorer-candidate-v6.json'],
    skill: ['skills', 'skill_v0006.md'],
    runner: 'codex-subagent-isolated-v6-candidate',
    scorer: 'codex-subagent-isolated-v6-scorer-candidate',
  },
];

const V7_RUNS = [
  {
    key: 'control',
    raw: 'no_guidance_v7_raw_outputs_isolated.json',
    scored: 'no_guidance_v7_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-no-guidance-v7.json'],
    scorerReceipt: ['receipts', 'scorer-no-guidance-v7.json'],
    skill: null,
    runner: 'codex-subagent-isolated-v7-control',
    scorer: 'codex-subagent-isolated-v7-scorer-control',
  },
  {
    key: 'baseline',
    raw: 'baseline_v7_raw_outputs_isolated.json',
    scored: 'baseline_v7_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-baseline-v7.json'],
    scorerReceipt: ['receipts', 'scorer-baseline-v7.json'],
    skill: ['skills', 'skill_v0000.md'],
    runner: 'codex-subagent-isolated-v7-baseline',
    scorer: 'codex-subagent-isolated-v7-scorer-baseline',
  },
  {
    key: 'candidate',
    raw: 'candidate_v7_raw_outputs_isolated.json',
    scored: 'candidate_v7_assertion_results_isolated.json',
    targetReceipt: ['receipts', 'target-candidate-v7.json'],
    scorerReceipt: ['receipts', 'scorer-candidate-v7.json'],
    skill: ['skills', 'skill_v0007.md'],
    runner: 'codex-subagent-isolated-v7-candidate',
    scorer: 'codex-subagent-isolated-v7-scorer-candidate',
  },
];

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
  assert.ok(values.length > 0, '不能对空集合计算均值');
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} !== ${expected}`);
}

function summarize(results) {
  const train = results.filter((result) => result.split === 'train');
  const validation = results.filter((result) => result.split === 'validation');
  const assertions = results.flatMap((result) => result.assertions);
  return {
    taskCount: results.length,
    trainTaskCount: train.length,
    validationTaskCount: validation.length,
    passCount: results.filter((result) => result.hard === 1).length,
    failCount: results.filter((result) => result.hard === 0).length,
    assertionPassCount: assertions.filter((entry) => entry.passed).length,
    assertionFailCount: assertions.filter((entry) => !entry.passed).length,
    trainHard: mean(train.map((result) => result.hard)),
    validationHard: mean(validation.map((result) => result.hard)),
    overallHard: mean(results.map((result) => result.hard)),
    trainSoft: mean(train.map((result) => result.soft)),
    validationSoft: mean(validation.map((result) => result.soft)),
    overallSoft: mean(results.map((result) => result.soft)),
  };
}

function assertSummary(actual, expected, label) {
  for (const key of [
    'taskCount',
    'trainTaskCount',
    'validationTaskCount',
    'passCount',
    'failCount',
    'assertionPassCount',
    'assertionFailCount',
  ]) {
    assert.equal(actual[key], expected[key], `${label}.${key}`);
  }
  for (const key of [
    'trainHard',
    'validationHard',
    'overallHard',
    'trainSoft',
    'validationSoft',
    'overallSoft',
  ]) {
    assertClose(actual[key], expected[key], `${label}.${key}`);
  }
}

function normalizeInputs(inputs) {
  return inputs
    .map(({ path: inputPath, sha256: inputHash }) => ({ path: inputPath, sha256: inputHash }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function assertReceipt({ receipt, expectedInputs, outputPath, outputText, role, source }) {
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.role, role);
  assert.equal(receipt.forkTurns, 'none');
  assert.ok(receipt.invocationId.trim().length > 0);
  assert.ok(receipt.agentTaskName.startsWith('/root/rex_tdd_'));
  assert.deepEqual(normalizeInputs(receipt.allowedInputs), normalizeInputs(expectedInputs));
  assert.ok(Array.isArray(receipt.forbiddenInputs) && receipt.forbiddenInputs.length > 0);
  assert.equal(receipt.outputPath, outputPath);
  assert.equal(receipt.outputSha256, sha256(outputText));
  assert.ok(Number.isFinite(Date.parse(receipt.generatedAt)));
  if (source) {
    assert.equal(receipt.sourceOutputPath, source.path);
    assert.equal(receipt.sourceOutputSha256, source.sha256);
  }
}

function assertArtifactRef(ref, expectedPath, expectedText, label) {
  assert.equal(ref.path, expectedPath, `${label}.path`);
  assert.equal(ref.sha256, sha256(expectedText), `${label}.sha256`);
}

async function loadRun(run, shared) {
  const [rawText, scoredText, targetReceipt, scorerReceipt, skillText] = await Promise.all([
    readText(TRAINING_ROOT, run.raw),
    readText(TRAINING_ROOT, run.scored),
    readJson(TRAINING_ROOT, ...run.targetReceipt),
    readJson(TRAINING_ROOT, ...run.scorerReceipt),
    run.skill ? readText(TRAINING_ROOT, ...run.skill) : null,
  ]);
  const raw = JSON.parse(rawText);
  const scored = JSON.parse(scoredText);
  const skillPath = run.skill ? `.skillopt/rex-tdd-2026-07-17/${run.skill.join('/')}` : null;
  const skillHash = skillText === null ? null : sha256(skillText);
  const rawPath = `.skillopt/rex-tdd-2026-07-17/${run.raw}`;
  const scoredPath = `.skillopt/rex-tdd-2026-07-17/${run.scored}`;

  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.runner, run.runner);
  assert.equal(raw.skillPath, skillPath);
  // v3 的两个 Target 仍使用早期 `*Hash` 别名；归档证据兼容读取，但仍校验同一 SHA-256 值。
  assert.equal('skillSha256' in raw ? raw.skillSha256 : raw.skillHash, skillHash);
  assert.equal(raw.promptProjectionPath, shared.promptPath);
  assert.equal(raw.promptProjectionSha256 ?? raw.promptProjectionHash, sha256(shared.promptText));
  assert.deepEqual(raw.results.map((result) => result.id), shared.tasks.map((task) => task.id));

  const targetInputs = [
    { path: shared.promptPath, sha256: sha256(shared.promptText) },
    ...(skillPath ? [{ path: skillPath, sha256: skillHash }] : []),
  ];
  assertReceipt({
    receipt: targetReceipt,
    expectedInputs: targetInputs,
    outputPath: rawPath,
    outputText: rawText,
    role: 'target',
  });

  assert.equal(scored.schemaVersion, 2);
  assert.equal(scored.runId, raw.runId);
  assert.equal(scored.scorer, run.scorer);
  assert.equal(scored.skillSha256, skillHash);
  assert.equal(scored.evalPath, shared.evalPath);
  assert.equal(scored.evalSha256, sha256(shared.evalText));
  assert.deepEqual(scored.taskInputs, shared.taskInputs);
  assert.equal(scored.promptProjectionPath, shared.promptPath);
  assert.equal(scored.promptProjectionSha256, sha256(shared.promptText));
  assert.equal(scored.sourceOutputPath, rawPath);
  assert.equal(scored.sourceOutputSha256, sha256(rawText));
  assert.deepEqual(scored.results.map((result) => result.id), shared.tasks.map((task) => task.id));

  const rawById = new Map(raw.results.map((result) => [result.id, result]));
  const scoredById = new Map(scored.results.map((result) => [result.id, result]));
  const promptById = new Map(shared.prompts.map((entry) => [entry.id, entry]));
  const evalById = new Map(shared.evals.map((entry) => [entry.id, entry]));
  for (const task of shared.tasks) {
    const rawResult = rawById.get(task.id);
    const scoredResult = scoredById.get(task.id);
    const projected = promptById.get(task.id);
    const definition = evalById.get(task.evalId);

    assert.deepEqual(Object.keys(rawResult).sort(), ['evalId', 'id', 'prompt', 'split', 'targetResponse']);
    assert.equal(rawResult.evalId, task.evalId);
    assert.equal(rawResult.split, projected.split);
    assert.equal(rawResult.prompt, projected.prompt);
    assert.equal(rawResult.prompt, definition.prompt);
    assert.ok(rawResult.targetResponse.trim().length > 0);

    assert.equal(scoredResult.evalId, task.evalId);
    assert.equal(scoredResult.split, task.split);
    assert.equal(scoredResult.split, projected.split);
    assert.equal(scoredResult.split, definition.split);
    assert.deepEqual(scoredResult.assertions.map((entry) => entry.name), task.assertions);
    for (const assertionResult of scoredResult.assertions) {
      assert.deepEqual(Object.keys(assertionResult).sort(), ['evidenceQuote', 'name', 'passed', 'rationale']);
      assert.equal(typeof assertionResult.passed, 'boolean');
      assert.ok(assertionResult.rationale.trim().length > 0);
      if (assertionResult.passed) {
        assert.ok(assertionResult.evidenceQuote.trim().length > 0);
        assert.ok(rawResult.targetResponse.includes(assertionResult.evidenceQuote));
      } else {
        assert.equal(assertionResult.evidenceQuote, '');
      }
    }

    const passed = scoredResult.assertions.filter((entry) => entry.passed).length;
    assert.equal(scoredResult.hard, passed === scoredResult.assertions.length ? 1 : 0);
    assertClose(scoredResult.soft, passed / scoredResult.assertions.length, `${task.id} soft`);
  }

  const summary = summarize(scored.results);
  assertSummary(scored.summary, summary, `${run.key}.summary`);

  const scorerInputs = [
    { path: rawPath, sha256: sha256(rawText) },
    { path: shared.evalPath, sha256: sha256(shared.evalText) },
    ...Object.values(shared.taskInputs),
    { path: shared.promptPath, sha256: sha256(shared.promptText) },
  ];
  assertReceipt({
    receipt: scorerReceipt,
    expectedInputs: scorerInputs,
    outputPath: scoredPath,
    outputText: scoredText,
    role: 'scorer',
    source: { path: rawPath, sha256: sha256(rawText) },
  });

  return { raw, rawText, scored, scoredText, summary, skillText };
}

test('rex-tdd v2 使用冻结候选和未泄漏的清洁留出集', async () => {
  const [
    archivedEvalText,
    v2EvalText,
    proposalText,
    designerReceipt,
    train,
    valid,
    prompts,
    candidateText,
    stepOneGate,
    historyText,
  ] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0001.json'),
    readText(TRAINING_ROOT, 'evals', 'eval_v0002.json'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v2-proposal.json'),
    readJson(TRAINING_ROOT, 'receipts', 'holdout-designer-v2.json'),
    readJson(TRAINING_ROOT, 'tasks', 'train-v2.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid-v2.json'),
    readJson(TRAINING_ROOT, 'tasks', 'prompt-projection-v2.json'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0002.md'),
    readJson(TRAINING_ROOT, 'steps', 'step_0001', 'gate_result.json'),
    readText(TRAINING_ROOT, 'history.jsonl'),
  ]);
  const archivedEvals = JSON.parse(archivedEvalText).evals;
  const canonicalEvals = JSON.parse(v2EvalText).evals;
  const proposal = JSON.parse(proposalText);

  assert.equal(sha256(archivedEvalText), V1_EVAL_HASH);
  assert.equal(sha256(proposalText), HOLDOUT_PROPOSAL_HASH);
  assert.equal(sha256(candidateText), V2_SKILL_HASH);
  assert.equal(designerReceipt.forkTurns, 'none');
  assert.deepEqual(designerReceipt.allowedInputs, []);
  assert.equal(designerReceipt.promptOnly, true);
  assert.equal(designerReceipt.outputPath, '.skillopt/rex-tdd-2026-07-17/tasks/holdout-v2-proposal.json');
  assert.equal(designerReceipt.outputSha256, HOLDOUT_PROPOSAL_HASH);

  assert.equal(stepOneGate.action, 'reject_validation_leak');
  assert.equal(stepOneGate.non_regression, false);
  assert.match(stepOneGate.reason, /rex-tdd-valid-003/);
  assert.match(historyText, /"action":"reject_validation_leak"/);
  assert.match(historyText, /"leaked_validation_task":"rex-tdd-valid-003"/);

  assert.equal(canonicalEvals.length, 15);
  assert.deepEqual(canonicalEvals.slice(0, 9), archivedEvals.slice(0, 9));
  const leakedDefinition = archivedEvals.find((entry) => entry.id === 13);
  assert.equal(canonicalEvals[9].id, 10);
  assert.equal(canonicalEvals[9].split, 'train');
  assert.equal(canonicalEvals[9].prompt, leakedDefinition.prompt);
  assert.deepEqual(canonicalEvals[9].assertions, leakedDefinition.assertions);
  assert.deepEqual(canonicalEvals.slice(10), proposal.map(({ id: _id, evalId, ...entry }) => ({ id: evalId, ...entry })));

  assert.equal(train.length, 10);
  assert.equal(valid.length, 5);
  const tasks = [...train.map((entry) => ({ ...entry, split: 'train' })), ...valid.map((entry) => ({ ...entry, split: 'validation' }))];
  assert.equal(new Set(tasks.map((entry) => entry.id)).size, 15);
  assert.deepEqual(
    prompts,
    tasks.map((task) => {
      const definition = canonicalEvals.find((entry) => entry.id === task.evalId);
      return { id: task.id, evalId: task.evalId, split: task.split, prompt: definition.prompt };
    }),
  );
  for (const projected of prompts) {
    assert.deepEqual(Object.keys(projected).sort(), ['evalId', 'id', 'prompt', 'split']);
  }
});

test('rex-tdd v2 的 Target、Scorer 与拒绝 Gate 形成端到端证据链', async () => {
  const [evalText, trainText, validText, promptText] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0002.json'),
    readText(TRAINING_ROOT, 'tasks', 'train-v2.json'),
    readText(TRAINING_ROOT, 'tasks', 'valid-v2.json'),
    readText(TRAINING_ROOT, 'tasks', 'prompt-projection-v2.json'),
  ]);
  const train = JSON.parse(trainText).map((entry) => ({ ...entry, split: 'train' }));
  const valid = JSON.parse(validText).map((entry) => ({ ...entry, split: 'validation' }));
  const shared = {
    evalPath: 'rex-harness/skill-sources/rex-tdd/evals/evals.json',
    evalText,
    evals: JSON.parse(evalText).evals,
    promptPath: '.skillopt/rex-tdd-2026-07-17/tasks/prompt-projection-v2.json',
    promptText,
    prompts: JSON.parse(promptText),
    tasks: [...train, ...valid],
    taskInputs: {
      train: { path: '.skillopt/rex-tdd-2026-07-17/tasks/train-v2.json', sha256: sha256(trainText) },
      validation: { path: '.skillopt/rex-tdd-2026-07-17/tasks/valid-v2.json', sha256: sha256(validText) },
    },
  };
  const loaded = Object.fromEntries(await Promise.all(RUNS.map(async (run) => [run.key, await loadRun(run, shared)])));
  const allReceipts = await Promise.all(RUNS.flatMap((run) => [
    readJson(TRAINING_ROOT, ...run.targetReceipt),
    readJson(TRAINING_ROOT, ...run.scorerReceipt),
  ]));
  assert.equal(new Set(allReceipts.map((receipt) => receipt.invocationId)).size, allReceipts.length);
  assert.equal(new Set(allReceipts.map((receipt) => receipt.agentTaskName)).size, allReceipts.length);

  const [baselineResults, rollout, gate, state, stepBuffer, proposalText, designerReceiptText] = await Promise.all([
    readJson(TRAINING_ROOT, 'baseline_results_v2.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0002', 'rollout_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0002', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'state_v2.json'),
    readJson(TRAINING_ROOT, 'step_buffer_v2.json'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v2-proposal.json'),
    readText(TRAINING_ROOT, 'receipts', 'holdout-designer-v2.json'),
  ]);

  assert.equal(baselineResults.round, 'clean-holdout-v2');
  assertArtifactRef(baselineResults.eval, shared.evalPath, evalText, 'baseline.eval');
  assert.deepEqual(baselineResults.taskInputs, shared.taskInputs);
  assertArtifactRef(baselineResults.promptProjection, shared.promptPath, promptText, 'baseline.prompt');
  for (const [key, run] of [['noGuidanceControl', loaded.control], ['currentSkill', loaded.baseline]]) {
    const entry = baselineResults[key];
    assertArtifactRef(entry.rawOutputs, `.skillopt/rex-tdd-2026-07-17/${RUNS.find((item) => item.key === (key === 'noGuidanceControl' ? 'control' : 'baseline')).raw}`, run.rawText, `${key}.raw`);
    assertArtifactRef(entry.assertionResults, `.skillopt/rex-tdd-2026-07-17/${RUNS.find((item) => item.key === (key === 'noGuidanceControl' ? 'control' : 'baseline')).scored}`, run.scoredText, `${key}.scored`);
    assertSummary(entry.summary, run.summary, `${key}.summary`);
  }

  assert.equal(rollout.step, 2);
  assert.equal(rollout.runId, loaded.candidate.raw.runId);
  assert.equal(rollout.candidateHash, V2_SKILL_HASH);
  assertArtifactRef(rollout.rawOutputs, '.skillopt/rex-tdd-2026-07-17/candidate_v2_raw_outputs_isolated.json', loaded.candidate.rawText, 'rollout.raw');
  assertArtifactRef(rollout.assertionResults, '.skillopt/rex-tdd-2026-07-17/candidate_v2_assertion_results_isolated.json', loaded.candidate.scoredText, 'rollout.scored');
  assert.deepEqual(rollout.taskInputs, shared.taskInputs);
  assertArtifactRef(rollout.cleanHoldout.proposal, '.skillopt/rex-tdd-2026-07-17/tasks/holdout-v2-proposal.json', proposalText, 'rollout.holdout');
  assertArtifactRef(rollout.cleanHoldout.designerReceipt, '.skillopt/rex-tdd-2026-07-17/receipts/holdout-designer-v2.json', designerReceiptText, 'rollout.designer');
  assert.deepEqual(rollout.results, loaded.candidate.scored.results.map(({ id, split, hard, soft }) => ({ id, split, hard, soft })));
  assertSummary(rollout.summary, loaded.candidate.summary, 'rollout.summary');

  const expectedRules = {
    validationBeatsBaseline: loaded.candidate.summary.validationHard > loaded.baseline.summary.validationHard,
    trainNotBelowBaseline: loaded.candidate.summary.trainHard >= loaded.baseline.summary.trainHard,
    validationNotBelowControl: loaded.candidate.summary.validationHard >= loaded.control.summary.validationHard,
    trainNotBelowControl: loaded.candidate.summary.trainHard >= loaded.control.summary.trainHard,
  };
  assert.deepEqual(gate.rules, expectedRules);
  assert.equal(expectedRules.validationBeatsBaseline, true);
  assert.equal(expectedRules.trainNotBelowBaseline, true);
  assert.equal(expectedRules.validationNotBelowControl, false);
  assert.equal(expectedRules.trainNotBelowControl, true);
  assert.equal(gate.action, 'reject_control_regression');
  assert.equal(gate.candidate_hash, V2_SKILL_HASH);
  assert.equal(gate.non_regression, false);
  assertClose(gate.candidate_train_hard, loaded.candidate.summary.trainHard, 'gate candidate train');
  assertClose(gate.candidate_validation_hard, loaded.candidate.summary.validationHard, 'gate candidate validation');
  assertClose(gate.baseline_train_hard, loaded.baseline.summary.trainHard, 'gate baseline train');
  assertClose(gate.baseline_validation_hard, loaded.baseline.summary.validationHard, 'gate baseline validation');
  assertClose(gate.control_train_hard, loaded.control.summary.trainHard, 'gate control train');
  assertClose(gate.control_validation_hard, loaded.control.summary.validationHard, 'gate control validation');

  assert.equal(state.status, 'holdout-v3-pending');
  assert.equal(state.gate, 'rejected');
  assert.equal(state.currentStep, 2);
  assert.equal(state.bestStep, 0);
  assert.equal(state.nonRegression, false);
  assert.equal(state.acceptedSkillHash, null);
  assertClose(state.metrics.controlTrainHard, loaded.control.summary.trainHard, 'state control train');
  assertClose(state.metrics.controlValidationHard, loaded.control.summary.validationHard, 'state control validation');
  assertClose(state.metrics.baselineTrainHard, loaded.baseline.summary.trainHard, 'state baseline train');
  assertClose(state.metrics.baselineValidationHard, loaded.baseline.summary.validationHard, 'state baseline validation');
  assertClose(state.metrics.rejectedCandidateTrainHard, loaded.candidate.summary.trainHard, 'state candidate train');
  assertClose(state.metrics.rejectedCandidateValidationHard, loaded.candidate.summary.validationHard, 'state candidate validation');
  assert.deepEqual(stepBuffer.entries.map((entry) => [entry.step, entry.action]), [
    [1, 'reject_validation_leak'],
    [2, 'reject_control_regression'],
  ]);
});

test('rex-tdd v3 在冻结候选后使用新的隔离留出集', async () => {
  const [
    evalText,
    proposalText,
    designerReceipt,
    train,
    valid,
    prompts,
    candidateText,
    patches,
  ] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0003.json'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v3-proposal.json'),
    readJson(TRAINING_ROOT, 'receipts', 'holdout-designer-v3.json'),
    readJson(TRAINING_ROOT, 'tasks', 'train-v3.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid-v3.json'),
    readJson(TRAINING_ROOT, 'tasks', 'prompt-projection-v3.json'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0003.md'),
    readJson(TRAINING_ROOT, 'steps', 'step_0002', 'patches.json'),
  ]);
  const evals = JSON.parse(evalText).evals;
  const proposal = JSON.parse(proposalText);

  assert.equal(sha256(evalText), V3_EVAL_HASH);
  assert.equal(sha256(proposalText), HOLDOUT_V3_PROPOSAL_HASH);
  assert.equal(sha256(candidateText), V3_SKILL_HASH);
  assert.equal(patches.outputSkill.path, '.skillopt/rex-tdd-2026-07-17/skills/skill_v0003.md');
  assert.equal(patches.outputSkill.sha256, V3_SKILL_HASH);
  assert.equal(patches.invalidatesHoldoutForFutureScoring, true);

  assert.equal(designerReceipt.role, 'holdout-designer');
  assert.equal(designerReceipt.forkTurns, 'none');
  assert.deepEqual(designerReceipt.allowedInputs, []);
  assert.equal(designerReceipt.promptOnly, true);
  assert.equal(designerReceipt.outputPath, '.skillopt/rex-tdd-2026-07-17/tasks/holdout-v3-proposal.json');
  assert.equal(designerReceipt.outputSha256, HOLDOUT_V3_PROPOSAL_HASH);

  assert.equal(train.length, 10);
  assert.equal(valid.length, 5);
  const tasks = [
    ...train.map((entry) => ({ ...entry, split: 'train' })),
    ...valid.map((entry) => ({ ...entry, split: 'validation' })),
  ];
  assert.equal(new Set(tasks.map((entry) => entry.id)).size, 15);
  assert.deepEqual(
    prompts,
    tasks.map((task) => {
      const definition = evals.find((entry) => entry.id === task.evalId);
      return { id: task.id, evalId: task.evalId, split: task.split, prompt: definition.prompt };
    }),
  );
  assert.deepEqual(
    evals.slice(10),
    proposal.map(({ id: _id, evalId, ...entry }) => ({ id: evalId, ...entry })),
  );
  for (const projected of prompts) {
    assert.deepEqual(Object.keys(projected).sort(), ['evalId', 'id', 'prompt', 'split']);
  }
});

test('rex-tdd v3 的 Target、Scorer 与拒绝 Gate 形成端到端证据链', async () => {
  const [evalText, trainText, validText, promptText] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0003.json'),
    readText(TRAINING_ROOT, 'tasks', 'train-v3.json'),
    readText(TRAINING_ROOT, 'tasks', 'valid-v3.json'),
    readText(TRAINING_ROOT, 'tasks', 'prompt-projection-v3.json'),
  ]);
  const train = JSON.parse(trainText).map((entry) => ({ ...entry, split: 'train' }));
  const valid = JSON.parse(validText).map((entry) => ({ ...entry, split: 'validation' }));
  const shared = {
    evalPath: 'rex-harness/skill-sources/rex-tdd/evals/evals.json',
    evalText,
    evals: JSON.parse(evalText).evals,
    promptPath: '.skillopt/rex-tdd-2026-07-17/tasks/prompt-projection-v3.json',
    promptText,
    prompts: JSON.parse(promptText),
    tasks: [...train, ...valid],
    taskInputs: {
      train: { path: '.skillopt/rex-tdd-2026-07-17/tasks/train-v3.json', sha256: sha256(trainText) },
      validation: { path: '.skillopt/rex-tdd-2026-07-17/tasks/valid-v3.json', sha256: sha256(validText) },
    },
  };
  const loaded = Object.fromEntries(await Promise.all(V3_RUNS.map(async (run) => [run.key, await loadRun(run, shared)])));
  const allReceipts = await Promise.all(V3_RUNS.flatMap((run) => [
    readJson(TRAINING_ROOT, ...run.targetReceipt),
    readJson(TRAINING_ROOT, ...run.scorerReceipt),
  ]));
  assert.equal(new Set(allReceipts.map((receipt) => receipt.invocationId)).size, allReceipts.length);
  assert.equal(new Set(allReceipts.map((receipt) => receipt.agentTaskName)).size, allReceipts.length);

  const [baselineResults, rollout, gate, state, stepBuffer, historyText, proposalText, designerReceiptText] = await Promise.all([
    readJson(TRAINING_ROOT, 'baseline_results_v3.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0003', 'rollout_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0003', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'state.json'),
    readJson(TRAINING_ROOT, 'step_buffer.json'),
    readText(TRAINING_ROOT, 'history.jsonl'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v3-proposal.json'),
    readText(TRAINING_ROOT, 'receipts', 'holdout-designer-v3.json'),
  ]);

  assert.equal(baselineResults.round, 'clean-holdout-v3');
  assertArtifactRef(baselineResults.eval, shared.evalPath, evalText, 'v3 baseline.eval');
  assert.deepEqual(baselineResults.taskInputs, shared.taskInputs);
  assertArtifactRef(baselineResults.promptProjection, shared.promptPath, promptText, 'v3 baseline.prompt');
  for (const [key, runKey] of [['noGuidanceControl', 'control'], ['currentSkill', 'baseline']]) {
    const entry = baselineResults[key];
    const run = loaded[runKey];
    const definition = V3_RUNS.find((item) => item.key === runKey);
    assertArtifactRef(entry.rawOutputs, `.skillopt/rex-tdd-2026-07-17/${definition.raw}`, run.rawText, `${key}.raw`);
    assertArtifactRef(entry.assertionResults, `.skillopt/rex-tdd-2026-07-17/${definition.scored}`, run.scoredText, `${key}.scored`);
    assertSummary(entry.summary, run.summary, `${key}.summary`);
  }

  assert.equal(rollout.step, 3);
  assert.equal(rollout.runId, loaded.candidate.raw.runId);
  assert.equal(rollout.candidateHash, V3_SKILL_HASH);
  assertArtifactRef(rollout.rawOutputs, '.skillopt/rex-tdd-2026-07-17/candidate_v3_raw_outputs_isolated.json', loaded.candidate.rawText, 'v3 rollout.raw');
  assertArtifactRef(rollout.assertionResults, '.skillopt/rex-tdd-2026-07-17/candidate_v3_assertion_results_isolated.json', loaded.candidate.scoredText, 'v3 rollout.scored');
  assert.deepEqual(rollout.taskInputs, shared.taskInputs);
  assertArtifactRef(rollout.cleanHoldout.proposal, '.skillopt/rex-tdd-2026-07-17/tasks/holdout-v3-proposal.json', proposalText, 'v3 rollout.holdout');
  assertArtifactRef(rollout.cleanHoldout.designerReceipt, '.skillopt/rex-tdd-2026-07-17/receipts/holdout-designer-v3.json', designerReceiptText, 'v3 rollout.designer');
  assert.deepEqual(rollout.results, loaded.candidate.scored.results.map(({ id, split, hard, soft }) => ({ id, split, hard, soft })));
  assertSummary(rollout.summary, loaded.candidate.summary, 'v3 rollout.summary');

  const expectedRules = {
    validationBeatsBaseline: loaded.candidate.summary.validationHard > loaded.baseline.summary.validationHard,
    trainNotBelowBaseline: loaded.candidate.summary.trainHard >= loaded.baseline.summary.trainHard,
    validationNotBelowControl: loaded.candidate.summary.validationHard >= loaded.control.summary.validationHard,
    trainNotBelowControl: loaded.candidate.summary.trainHard >= loaded.control.summary.trainHard,
  };
  assert.deepEqual(gate.rules, expectedRules);
  assert.deepEqual(expectedRules, {
    validationBeatsBaseline: false,
    trainNotBelowBaseline: true,
    validationNotBelowControl: false,
    trainNotBelowControl: true,
  });
  assert.equal(gate.action, 'reject_validation_and_control_regression');
  assert.equal(gate.candidate_hash, V3_SKILL_HASH);
  assert.equal(gate.non_regression, false);

  assert.ok(state.currentStep >= 3);
  assert.deepEqual(stepBuffer.entries.slice(0, 3).map((entry) => [entry.step, entry.action]), [
    [1, 'reject_validation_leak'],
    [2, 'reject_control_regression'],
    [3, 'reject_validation_and_control_regression'],
  ]);
  assert.match(historyText, /"step":3/);
  assert.match(historyText, /"action":"reject_validation_and_control_regression"/);
});

test('rex-tdd v4 冻结候选后使用了新的隔离留出集', async () => {
  const [evalText, previousEval, train, valid, prompts, proposalText, freeze, designerReceipt, skillText] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0004.json'),
    readJson(TRAINING_ROOT, 'evals', 'eval_v0003.json'),
    readJson(TRAINING_ROOT, 'tasks', 'train-v4.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid-v4.json'),
    readJson(TRAINING_ROOT, 'tasks', 'prompt-projection-v4.json'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v4-proposal.json'),
    readJson(TRAINING_ROOT, 'receipts', 'candidate-freeze-v4.json'),
    readJson(TRAINING_ROOT, 'receipts', 'holdout-designer-v4.json'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0004.md'),
  ]);
  const evals = JSON.parse(evalText).evals;
  const proposal = JSON.parse(proposalText);

  assert.equal(sha256(evalText), V4_EVAL_HASH);
  assert.equal(sha256(proposalText), HOLDOUT_V4_PROPOSAL_HASH);
  assert.equal(sha256(skillText), V4_SKILL_HASH);
  assert.equal(evals.length, 20);
  assert.deepEqual(evals.slice(0, 10), previousEval.evals.slice(0, 10));
  assert.deepEqual(evals.slice(10, 15), previousEval.evals.slice(10).map((entry) => ({ ...entry, split: 'train' })));
  assert.deepEqual(evals.slice(15), proposal.map(({ id: _id, evalId, ...entry }) => ({ id: evalId, ...entry })));
  assert.equal(train.length, 15);
  assert.equal(valid.length, 5);
  assert.equal(prompts.length, 20);
  assert.deepEqual(valid.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })), proposal.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })));
  assert.deepEqual(
    prompts,
    [...train.map((task) => ({ ...task, split: 'train' })), ...valid.map((task) => ({ ...task, split: 'validation' }))].map((task) => ({
      id: task.id,
      evalId: task.evalId,
      split: task.split,
      prompt: evals.find((entry) => entry.id === task.evalId).prompt,
    })),
  );
  assert.ok(prompts.every((entry) => Object.keys(entry).sort().join(',') === 'evalId,id,prompt,split'));
  assert.equal(freeze.outputSha256, V4_SKILL_HASH);
  assert.equal(designerReceipt.outputSha256, HOLDOUT_V4_PROPOSAL_HASH);
  assert.ok(Date.parse(freeze.generatedAt) < Date.parse(designerReceipt.generatedAt));
});

test('rex-tdd v4 的隔离证据链拒绝无判别力的留出集', async () => {
  const [evalText, trainText, validText, promptText] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0004.json'),
    readText(TRAINING_ROOT, 'tasks', 'train-v4.json'),
    readText(TRAINING_ROOT, 'tasks', 'valid-v4.json'),
    readText(TRAINING_ROOT, 'tasks', 'prompt-projection-v4.json'),
  ]);
  const train = JSON.parse(trainText).map((entry) => ({ ...entry, split: 'train' }));
  const valid = JSON.parse(validText).map((entry) => ({ ...entry, split: 'validation' }));
  const shared = {
    evalPath: 'rex-harness/skill-sources/rex-tdd/evals/evals.json',
    evalText,
    evals: JSON.parse(evalText).evals,
    promptPath: '.skillopt/rex-tdd-2026-07-17/tasks/prompt-projection-v4.json',
    promptText,
    prompts: JSON.parse(promptText),
    tasks: [...train, ...valid],
    taskInputs: {
      train: { path: '.skillopt/rex-tdd-2026-07-17/tasks/train-v4.json', sha256: sha256(trainText) },
      validation: { path: '.skillopt/rex-tdd-2026-07-17/tasks/valid-v4.json', sha256: sha256(validText) },
    },
  };
  const loaded = Object.fromEntries(await Promise.all(V4_RUNS.map(async (run) => [run.key, await loadRun(run, shared)])));
  const [baselineResults, rollout, gate, state, stepBuffer, historyText, proposalText, designerReceiptText] = await Promise.all([
    readJson(TRAINING_ROOT, 'baseline_results_v4.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0004', 'rollout_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0004', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'state.json'),
    readJson(TRAINING_ROOT, 'step_buffer.json'),
    readText(TRAINING_ROOT, 'history.jsonl'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v4-proposal.json'),
    readText(TRAINING_ROOT, 'receipts', 'holdout-designer-v4.json'),
  ]);

  assert.equal(baselineResults.round, 'clean-holdout-v4-invalid');
  assertArtifactRef(baselineResults.eval, shared.evalPath, evalText, 'v4 baseline.eval');
  assert.deepEqual(baselineResults.taskInputs, shared.taskInputs);
  assertArtifactRef(baselineResults.promptProjection, shared.promptPath, promptText, 'v4 baseline.prompt');
  for (const [key, runKey] of [['noGuidanceControl', 'control'], ['currentSkill', 'baseline']]) {
    const entry = baselineResults[key];
    const run = loaded[runKey];
    const definition = V4_RUNS.find((item) => item.key === runKey);
    assertArtifactRef(entry.rawOutputs, `.skillopt/rex-tdd-2026-07-17/${definition.raw}`, run.rawText, `${key}.raw`);
    assertArtifactRef(entry.assertionResults, `.skillopt/rex-tdd-2026-07-17/${definition.scored}`, run.scoredText, `${key}.scored`);
    assertSummary(entry.summary, run.summary, `${key}.summary`);
  }
  assert.equal(rollout.step, 4);
  assert.equal(rollout.runId, loaded.candidate.raw.runId);
  assert.equal(rollout.candidateHash, V4_SKILL_HASH);
  assertArtifactRef(rollout.rawOutputs, '.skillopt/rex-tdd-2026-07-17/candidate_v4_raw_outputs_isolated.json', loaded.candidate.rawText, 'v4 rollout.raw');
  assertArtifactRef(rollout.assertionResults, '.skillopt/rex-tdd-2026-07-17/candidate_v4_assertion_results_isolated.json', loaded.candidate.scoredText, 'v4 rollout.scored');
  assert.deepEqual(rollout.taskInputs, shared.taskInputs);
  assertArtifactRef(rollout.cleanHoldout.proposal, '.skillopt/rex-tdd-2026-07-17/tasks/holdout-v4-proposal.json', proposalText, 'v4 rollout.holdout');
  assertArtifactRef(rollout.cleanHoldout.designerReceipt, '.skillopt/rex-tdd-2026-07-17/receipts/holdout-designer-v4.json', designerReceiptText, 'v4 rollout.designer');
  assertSummary(rollout.summary, loaded.candidate.summary, 'v4 rollout.summary');

  assert.deepEqual(gate.rules, {
    validationBeatsBaseline: false,
    trainNotBelowBaseline: true,
    validationNotBelowControl: true,
    trainNotBelowControl: true,
  });
  assert.equal(gate.action, 'reject_non_discriminating_validation');
  assert.equal(gate.holdoutValidity, 'invalid_execution_protocol_mismatch');
  assert.equal(gate.candidate_hash, V4_SKILL_HASH);
  assert.equal(gate.non_regression, true);
  assert.ok(state.currentStep >= 4);
  assert.deepEqual(stepBuffer.entries.slice(0, 4).map((entry) => [entry.step, entry.action]), [
    [1, 'reject_validation_leak'],
    [2, 'reject_control_regression'],
    [3, 'reject_validation_and_control_regression'],
    [4, 'reject_non_discriminating_validation'],
  ]);
  assert.match(historyText, /"step":4/);
  assert.match(historyText, /"action":"reject_non_discriminating_validation"/);
});

test('rex-tdd v5 在候选冻结后改用 prompt 可观察的清洁留出集', async () => {
  const [evalText, previousEval, train, valid, prompts, proposalText, freeze, designerReceipt, skillText] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0005.json'),
    readJson(TRAINING_ROOT, 'evals', 'eval_v0004.json'),
    readJson(TRAINING_ROOT, 'tasks', 'train-v5.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid-v5.json'),
    readJson(TRAINING_ROOT, 'tasks', 'prompt-projection-v5.json'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v5-proposal.json'),
    readJson(TRAINING_ROOT, 'receipts', 'candidate-freeze-v5.json'),
    readJson(TRAINING_ROOT, 'receipts', 'holdout-designer-v5.json'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0005.md'),
  ]);
  const evals = JSON.parse(evalText).evals;
  const proposal = JSON.parse(proposalText);

  assert.equal(sha256(evalText), V5_EVAL_HASH);
  assert.equal(sha256(proposalText), HOLDOUT_V5_PROPOSAL_HASH);
  assert.equal(sha256(skillText), V5_SKILL_HASH);
  assert.equal(evals.length, 25);
  assert.deepEqual(evals.slice(0, 20), previousEval.evals.map((entry) => ({ ...entry, split: 'train' })));
  assert.deepEqual(evals.slice(20), proposal.map(({ id: _id, evalId, ...entry }) => ({ id: evalId, ...entry })));
  assert.equal(train.length, 20);
  assert.equal(valid.length, 5);
  assert.equal(prompts.length, 25);
  assert.deepEqual(valid.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })), proposal.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })));
  assert.deepEqual(
    prompts,
    [...train.map((task) => ({ ...task, split: 'train' })), ...valid.map((task) => ({ ...task, split: 'validation' }))].map((task) => ({
      id: task.id,
      evalId: task.evalId,
      split: task.split,
      prompt: evals.find((entry) => entry.id === task.evalId).prompt,
    })),
  );
  assert.ok(prompts.every((entry) => Object.keys(entry).sort().join(',') === 'evalId,id,prompt,split'));
  assert.equal(freeze.outputSha256, V5_SKILL_HASH);
  assert.equal(designerReceipt.outputSha256, HOLDOUT_V5_PROPOSAL_HASH);
  assert.ok(Date.parse(freeze.generatedAt) < Date.parse(designerReceipt.generatedAt));
});

test('rex-tdd v5 隔离证据链识别真实 Skill 缺口并消费留出集', async () => {
  const [evalText, trainText, validText, promptText, baselineResults, rollout, gate, patches, state, buffer, historyText, v6Skill, v6Freeze] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0005.json'),
    readText(TRAINING_ROOT, 'tasks', 'train-v5.json'),
    readText(TRAINING_ROOT, 'tasks', 'valid-v5.json'),
    readText(TRAINING_ROOT, 'tasks', 'prompt-projection-v5.json'),
    readJson(TRAINING_ROOT, 'baseline_results_v5.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0005', 'rollout_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0005', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0005', 'patches.json'),
    readJson(TRAINING_ROOT, 'state.json'),
    readJson(TRAINING_ROOT, 'step_buffer.json'),
    readText(TRAINING_ROOT, 'history.jsonl'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0006.md'),
    readJson(TRAINING_ROOT, 'receipts', 'candidate-freeze-v6.json'),
  ]);
  const evals = JSON.parse(evalText).evals;
  const train = JSON.parse(trainText).map((entry) => ({ ...entry, split: 'train' }));
  const valid = JSON.parse(validText).map((entry) => ({ ...entry, split: 'validation' }));
  const prompts = JSON.parse(promptText);
  const tasks = [...train, ...valid];
  const shared = {
    evals,
    evalPath: 'rex-harness/skill-sources/rex-tdd/evals/evals.json',
    evalText,
    taskInputs: {
      train: {
        path: '.skillopt/rex-tdd-2026-07-17/tasks/train-v5.json',
        sha256: sha256(trainText),
      },
      validation: {
        path: '.skillopt/rex-tdd-2026-07-17/tasks/valid-v5.json',
        sha256: sha256(validText),
      },
    },
    tasks,
    prompts,
    promptPath: '.skillopt/rex-tdd-2026-07-17/tasks/prompt-projection-v5.json',
    promptText,
  };
  const loaded = Object.fromEntries(await Promise.all(V5_RUNS.map(async (run) => [run.key, await loadRun(run, shared)])));

  assert.equal(loaded.control.summary.trainHard, 0.8);
  assert.equal(loaded.control.summary.validationHard, 1);
  assert.equal(loaded.baseline.summary.trainHard, 0.65);
  assert.equal(loaded.baseline.summary.validationHard, 0.8);
  assert.equal(loaded.candidate.summary.trainHard, 0.8);
  assert.equal(loaded.candidate.summary.validationHard, 0.8);

  const invocationIds = [];
  for (const run of V5_RUNS) {
    const target = await readJson(TRAINING_ROOT, ...run.targetReceipt);
    const scorer = await readJson(TRAINING_ROOT, ...run.scorerReceipt);
    invocationIds.push(target.invocationId, scorer.invocationId);
  }
  assert.equal(new Set(invocationIds).size, invocationIds.length);

  assert.equal(baselineResults.holdoutValidity, 'valid_discriminating_consumed');
  assertArtifactRef(rollout.rawOutputs, '.skillopt/rex-tdd-2026-07-17/candidate_v5_raw_outputs_isolated.json', loaded.candidate.rawText, 'v5 rollout raw');
  assertArtifactRef(rollout.assertionResults, '.skillopt/rex-tdd-2026-07-17/candidate_v5_assertion_results_isolated.json', loaded.candidate.scoredText, 'v5 rollout scored');
  assert.equal(gate.action, 'reject_validation_and_control_regression');
  assert.equal(gate.holdoutValidity, 'valid_discriminating_consumed');
  assert.deepEqual(gate.rules, {
    validationBeatsBaseline: false,
    trainNotBelowBaseline: true,
    validationNotBelowControl: false,
    trainNotBelowControl: true,
  });
  assert.deepEqual(gate.failedValidationTasks, ['rex-tdd-v5-valid-001']);
  assert.equal(patches.failureSummary[0].failureType, 'selected-strict-command-authorization-reopened');
  assert.equal(sha256(v6Skill), V6_SKILL_HASH);
  assert.equal(patches.outputSkill.sha256, V6_SKILL_HASH);
  assert.equal(v6Freeze.outputSha256, V6_SKILL_HASH);
  assert.ok(state.currentStep >= 5);
  assert.deepEqual(buffer.entries.filter((entry) => entry.step === 5).map((entry) => [entry.step, entry.action]), [
    [5, 'reject_validation_and_control_regression'],
  ]);
  assert.match(historyText, /"step":5/);
  assert.match(historyText, /"action":"reject_validation_and_control_regression"/);
});

test('rex-tdd v6 在候选冻结后使用新的 prompt 可观察留出集', async () => {
  const [evalText, previousEval, train, valid, prompts, proposalText, freeze, designerReceipt, skillText] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0006.json'),
    readJson(TRAINING_ROOT, 'evals', 'eval_v0005.json'),
    readJson(TRAINING_ROOT, 'tasks', 'train-v6.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid-v6.json'),
    readJson(TRAINING_ROOT, 'tasks', 'prompt-projection-v6.json'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v6-proposal.json'),
    readJson(TRAINING_ROOT, 'receipts', 'candidate-freeze-v6.json'),
    readJson(TRAINING_ROOT, 'receipts', 'holdout-designer-v6.json'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0006.md'),
  ]);
  const evals = JSON.parse(evalText).evals;
  const proposal = JSON.parse(proposalText);

  assert.equal(sha256(evalText), V6_EVAL_HASH);
  assert.equal(sha256(proposalText), HOLDOUT_V6_PROPOSAL_HASH);
  assert.equal(sha256(skillText), V6_SKILL_HASH);
  assert.equal(evals.length, 30);
  assert.deepEqual(evals.slice(0, 25), previousEval.evals.map((entry) => ({ ...entry, split: 'train' })));
  assert.deepEqual(evals.slice(25), proposal.map(({ id: _id, evalId, ...entry }) => ({ id: evalId, ...entry })));
  assert.equal(train.length, 25);
  assert.equal(valid.length, 5);
  assert.equal(prompts.length, 30);
  assert.deepEqual(valid.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })), proposal.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })));
  assert.deepEqual(
    prompts,
    [...train.map((task) => ({ ...task, split: 'train' })), ...valid.map((task) => ({ ...task, split: 'validation' }))].map((task) => ({
      id: task.id,
      evalId: task.evalId,
      split: task.split,
      prompt: evals.find((entry) => entry.id === task.evalId).prompt,
    })),
  );
  assert.ok(prompts.every((entry) => Object.keys(entry).sort().join(',') === 'evalId,id,prompt,split'));
  assert.equal(freeze.outputSha256, V6_SKILL_HASH);
  assert.equal(designerReceipt.outputSha256, HOLDOUT_V6_PROPOSAL_HASH);
  assert.ok(Date.parse(freeze.generatedAt) < Date.parse(designerReceipt.generatedAt));
});

test('rex-tdd v6 隔离证据链识别 hard 分数饱和与控制组回归', async () => {
  const [
    evalText,
    trainText,
    validText,
    promptText,
    baselineResults,
    rollout,
    gate,
    patches,
    buffer,
    historyText,
  ] = await Promise.all([
    readText(TRAINING_ROOT, 'evals', 'eval_v0006.json'),
    readText(TRAINING_ROOT, 'tasks', 'train-v6.json'),
    readText(TRAINING_ROOT, 'tasks', 'valid-v6.json'),
    readText(TRAINING_ROOT, 'tasks', 'prompt-projection-v6.json'),
    readJson(TRAINING_ROOT, 'baseline_results_v6.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0006', 'rollout_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0006', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0006', 'patches.json'),
    readJson(TRAINING_ROOT, 'step_buffer.json'),
    readText(TRAINING_ROOT, 'history.jsonl'),
  ]);
  const evals = JSON.parse(evalText).evals;
  const train = JSON.parse(trainText).map((entry) => ({ ...entry, split: 'train' }));
  const valid = JSON.parse(validText).map((entry) => ({ ...entry, split: 'validation' }));
  const prompts = JSON.parse(promptText);
  const tasks = [...train, ...valid];
  const shared = {
    evals,
    evalPath: 'rex-harness/skill-sources/rex-tdd/evals/evals.json',
    evalText,
    taskInputs: {
      train: {
        path: '.skillopt/rex-tdd-2026-07-17/tasks/train-v6.json',
        sha256: sha256(trainText),
      },
      validation: {
        path: '.skillopt/rex-tdd-2026-07-17/tasks/valid-v6.json',
        sha256: sha256(validText),
      },
    },
    tasks,
    prompts,
    promptPath: '.skillopt/rex-tdd-2026-07-17/tasks/prompt-projection-v6.json',
    promptText,
  };
  const loaded = Object.fromEntries(await Promise.all(V6_RUNS.map(async (run) => [run.key, await loadRun(run, shared)])));

  assert.equal(loaded.control.summary.trainHard, 0.84);
  assert.equal(loaded.control.summary.validationHard, 0);
  assert.equal(loaded.baseline.summary.trainHard, 0.4);
  assert.equal(loaded.baseline.summary.validationHard, 0);
  assert.equal(loaded.candidate.summary.trainHard, 0.64);
  assert.equal(loaded.candidate.summary.validationHard, 0);
  assert.ok(loaded.candidate.summary.validationSoft > loaded.baseline.summary.validationSoft);
  assert.ok(loaded.candidate.summary.trainHard < loaded.control.summary.trainHard);

  const invocationIds = [];
  for (const run of V6_RUNS) {
    const target = await readJson(TRAINING_ROOT, ...run.targetReceipt);
    const scorer = await readJson(TRAINING_ROOT, ...run.scorerReceipt);
    invocationIds.push(target.invocationId, scorer.invocationId);
  }
  assert.equal(new Set(invocationIds).size, invocationIds.length);

  assert.equal(baselineResults.holdoutValidity, 'invalid_hard_score_saturation_consumed');
  assertArtifactRef(rollout.rawOutputs, '.skillopt/rex-tdd-2026-07-17/candidate_v6_raw_outputs_isolated.json', loaded.candidate.rawText, 'v6 rollout raw');
  assertArtifactRef(rollout.assertionResults, '.skillopt/rex-tdd-2026-07-17/candidate_v6_assertion_results_isolated.json', loaded.candidate.scoredText, 'v6 rollout scored');
  assert.equal(gate.action, 'reject_non_discriminating_validation_and_control_regression');
  assert.equal(gate.holdoutValidity, 'invalid_hard_score_saturation_consumed');
  assert.deepEqual(gate.rules, {
    validationBeatsBaseline: false,
    trainNotBelowBaseline: true,
    validationNotBelowControl: true,
    trainNotBelowControl: false,
  });
  assert.equal(patches.failureSummary[0].failureType, 'hard-score-saturation');
  assert.equal(patches.failureSummary[1].failureType, 'frozen-observation-material-facts-underreported');
  assert.deepEqual(buffer.entries.filter((entry) => entry.step === 6).map((entry) => [entry.step, entry.action]), [
    [6, 'reject_non_discriminating_validation_and_control_regression'],
  ]);
  assert.match(historyText, /"step":6/);
  assert.match(historyText, /"action":"reject_non_discriminating_validation_and_control_regression"/);
});

test('rex-tdd v7 在候选冻结后使用正交断言的全新留出集', async () => {
  const [canonicalText, evalText, previousEval, train, valid, prompts, proposalText, freeze, designerReceipt, skillText] = await Promise.all([
    readText(CANONICAL_EVAL),
    readText(TRAINING_ROOT, 'evals', 'eval_v0007.json'),
    readJson(TRAINING_ROOT, 'evals', 'eval_v0006.json'),
    readJson(TRAINING_ROOT, 'tasks', 'train-v7.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid-v7.json'),
    readJson(TRAINING_ROOT, 'tasks', 'prompt-projection-v7.json'),
    readText(TRAINING_ROOT, 'tasks', 'holdout-v7-proposal.json'),
    readJson(TRAINING_ROOT, 'receipts', 'candidate-freeze-v7.json'),
    readJson(TRAINING_ROOT, 'receipts', 'holdout-designer-v7.json'),
    readText(TRAINING_ROOT, 'skills', 'skill_v0007.md'),
  ]);
  const evals = JSON.parse(evalText).evals;
  const proposal = JSON.parse(proposalText);

  assert.equal(canonicalText, evalText);
  assert.equal(sha256(evalText), V7_EVAL_HASH);
  assert.equal(sha256(proposalText), HOLDOUT_V7_PROPOSAL_HASH);
  assert.equal(sha256(skillText), V7_SKILL_HASH);
  assert.equal(evals.length, 35);
  assert.deepEqual(evals.slice(0, 30), previousEval.evals.map((entry) => ({ ...entry, split: 'train' })));
  assert.deepEqual(evals.slice(30), proposal.map(({ id: _id, evalId, ...entry }) => ({ id: evalId, ...entry })));
  assert.equal(train.length, 30);
  assert.equal(valid.length, 5);
  assert.equal(prompts.length, 35);
  assert.ok(valid.every((entry) => entry.assertions.length === 3));
  assert.deepEqual(valid.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })), proposal.map(({ id, evalId, assertions }) => ({ id, evalId, assertions })));
  assert.deepEqual(
    prompts,
    [...train.map((task) => ({ ...task, split: 'train' })), ...valid.map((task) => ({ ...task, split: 'validation' }))].map((task) => ({
      id: task.id,
      evalId: task.evalId,
      split: task.split,
      prompt: evals.find((entry) => entry.id === task.evalId).prompt,
    })),
  );
  assert.ok(prompts.every((entry) => Object.keys(entry).sort().join(',') === 'evalId,id,prompt,split'));
  assert.equal(freeze.outputSha256, V7_SKILL_HASH);
  assert.equal(designerReceipt.outputSha256, HOLDOUT_V7_PROPOSAL_HASH);
  assert.ok(Date.parse(freeze.generatedAt) < Date.parse(designerReceipt.generatedAt));
});

test('rex-tdd v7 的隔离 Target、Scorer 和四条 Gate 接受候选', async () => {
  const [evalText, trainText, validText, promptText, baselineResults, rollout, gate, state, buffer, historyText, bestSkill, canonicalSkill] = await Promise.all([
    readText(CANONICAL_EVAL),
    readText(TRAINING_ROOT, 'tasks', 'train-v7.json'),
    readText(TRAINING_ROOT, 'tasks', 'valid-v7.json'),
    readText(TRAINING_ROOT, 'tasks', 'prompt-projection-v7.json'),
    readJson(TRAINING_ROOT, 'baseline_results_v7.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0007', 'rollout_results.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0007', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'state.json'),
    readJson(TRAINING_ROOT, 'step_buffer.json'),
    readText(TRAINING_ROOT, 'history.jsonl'),
    readText(TRAINING_ROOT, 'best_skill.md'),
    readText(CANONICAL_SKILL),
  ]);
  const train = JSON.parse(trainText).map((entry) => ({ ...entry, split: 'train' }));
  const valid = JSON.parse(validText).map((entry) => ({ ...entry, split: 'validation' }));
  const shared = {
    evalPath: 'rex-harness/skill-sources/rex-tdd/evals/evals.json',
    evalText,
    evals: JSON.parse(evalText).evals,
    promptPath: '.skillopt/rex-tdd-2026-07-17/tasks/prompt-projection-v7.json',
    promptText,
    prompts: JSON.parse(promptText),
    tasks: [...train, ...valid],
    taskInputs: {
      train: { path: '.skillopt/rex-tdd-2026-07-17/tasks/train-v7.json', sha256: sha256(trainText) },
      validation: { path: '.skillopt/rex-tdd-2026-07-17/tasks/valid-v7.json', sha256: sha256(validText) },
    },
  };
  const loaded = Object.fromEntries(await Promise.all(V7_RUNS.map(async (run) => [run.key, await loadRun(run, shared)])));
  const receipts = await Promise.all(V7_RUNS.flatMap((run) => [
    readJson(TRAINING_ROOT, ...run.targetReceipt),
    readJson(TRAINING_ROOT, ...run.scorerReceipt),
  ]));

  assert.equal(new Set(receipts.map((receipt) => receipt.invocationId)).size, 6);
  assert.deepEqual(Object.keys(loaded.candidate.scored.summary), [
    'taskCount', 'trainTaskCount', 'validationTaskCount', 'passCount', 'failCount',
    'assertionPassCount', 'assertionFailCount', 'trainHard', 'validationHard',
    'overallHard', 'trainSoft', 'validationSoft', 'overallSoft',
  ]);
  assert.equal(loaded.candidate.scored.results.length, 35);
  assert.equal(loaded.candidate.scored.results.flatMap((result) => result.assertions).length, 135);
  assertClose(loaded.control.summary.trainHard, 0.5, 'control.trainHard');
  assertClose(loaded.control.summary.validationHard, 0, 'control.validationHard');
  assertClose(loaded.baseline.summary.trainHard, 0.4, 'baseline.trainHard');
  assertClose(loaded.baseline.summary.validationHard, 0, 'baseline.validationHard');
  assertClose(loaded.candidate.summary.trainHard, 0.7333333333333333, 'candidate.trainHard');
  assertClose(loaded.candidate.summary.validationHard, 1, 'candidate.validationHard');

  assertArtifactRef(baselineResults.eval, shared.evalPath, evalText, 'baseline-v7.eval');
  assert.deepEqual(baselineResults.taskInputs, shared.taskInputs);
  assertArtifactRef(baselineResults.promptProjection, shared.promptPath, promptText, 'baseline-v7.prompt');
  assertSummary(baselineResults.noGuidanceControl.summary, loaded.control.summary, 'baseline-v7.control');
  assertSummary(baselineResults.currentSkill.summary, loaded.baseline.summary, 'baseline-v7.baseline');
  assertSummary(baselineResults.candidate.summary, loaded.candidate.summary, 'baseline-v7.candidate');
  assertArtifactRef(rollout.rawOutputs, '.skillopt/rex-tdd-2026-07-17/candidate_v7_raw_outputs_isolated.json', loaded.candidate.rawText, 'rollout-v7.raw');
  assertArtifactRef(rollout.assertionResults, '.skillopt/rex-tdd-2026-07-17/candidate_v7_assertion_results_isolated.json', loaded.candidate.scoredText, 'rollout-v7.scored');
  assertSummary(rollout.summary, loaded.candidate.summary, 'rollout-v7.summary');

  assert.equal(gate.action, 'accept_new_best');
  assert.equal(gate.holdoutValidity, 'valid_discriminating_consumed');
  assert.equal(gate.candidate_hash, V7_SKILL_HASH);
  assert.deepEqual(gate.rules, {
    validationBeatsBaseline: true,
    trainNotBelowBaseline: true,
    validationNotBelowControl: true,
    trainNotBelowControl: true,
  });
  assert.equal(gate.non_regression, true);
  assert.deepEqual(gate.failedValidationTasks, []);
  assert.equal(state.status, 'accepted');
  assert.equal(state.gate, 'accepted');
  assert.equal(state.bestStep, 7);
  assert.equal(state.acceptedSkillHash, V7_SKILL_HASH);
  assert.equal(state.holdoutValidity, 'valid_discriminating_consumed');
  assert.deepEqual(buffer.entries.slice(-1).map((entry) => [entry.step, entry.action]), [[7, 'accept_new_best']]);
  assert.match(historyText, /"step":7/);
  assert.match(historyText, /"action":"accept_new_best"/);
  assert.equal(sha256(bestSkill), V7_SKILL_HASH);
  assert.equal(canonicalSkill, bestSkill);
});

test('训练 Gate 只验证当前 rex-tdd 的已接受哈希', async () => {
  const report = await verifySkillTrainingGate({
    rootDir: ROOT,
    changedFiles: ['rex-harness/skill-sources/rex-tdd/SKILL.md'],
  });

  assert.equal(report.status, 'verified');
  assert.deepEqual(report.skills.map((skill) => [skill.skillId, skill.status]), [
    ['rex-tdd', 'verified'],
  ]);
});
