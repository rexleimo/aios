import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTrainingEvidence } from '../lib/skills/training-evidence-validator.mjs';

const tasks = [
  { id: 'train-1', split: 'train', assertions: ['states scope', 'lists evidence'] },
  { id: 'valid-1', split: 'validation', assertions: ['names a risk'] },
];

function validArtifacts() {
  const raw = {
    runId: 'run-1',
    results: [
      { id: 'train-1', targetResponse: 'Scope is the parser. Evidence is the focused unit test.' },
      { id: 'valid-1', targetResponse: 'The risk is accepting a fabricated evidence quote.' },
    ],
  };
  const scored = {
    runId: 'run-1',
    results: [
      {
        id: 'train-1',
        split: 'train',
        assertions: [
          { name: 'states scope', passed: true, evidenceQuote: 'Scope is the parser.', rationale: 'The scope is explicit.' },
          { name: 'lists evidence', passed: true, evidenceQuote: 'Evidence is the focused unit test.', rationale: 'The evidence is explicit.' },
        ],
        hard: 1,
        soft: 1,
      },
      {
        id: 'valid-1',
        split: 'validation',
        assertions: [
          { name: 'names a risk', passed: true, evidenceQuote: 'The risk is accepting a fabricated evidence quote.', rationale: 'The risk is named.' },
        ],
        hard: 1,
        soft: 1,
      },
    ],
    summary: {
      trainHard: 1,
      validationHard: 1,
      overallHard: 1,
    },
  };
  return { raw, scored };
}

test('接受由断言推导分数的完整证据', () => {
  const { raw, scored } = validArtifacts();
  const result = validateTrainingEvidence({ tasks, raw, scored });

  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.metrics, {
    taskCount: 2,
    trainTaskCount: 1,
    validationTaskCount: 1,
    trainHard: 1,
    validationHard: 1,
    overallHard: 1,
  });
});

test('拒绝不在原始回答中的成功引用', () => {
  const { raw, scored } = validArtifacts();
  scored.results[1].assertions[0].evidenceQuote = 'The answer names a risk.';

  const result = validateTrainingEvidence({ tasks, raw, scored });

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((entry) => entry.code === 'passed_quote_not_in_raw_response'));
});

test('拒绝仍保留引用的失败断言', () => {
  const { raw, scored } = validArtifacts();
  scored.results[0].assertions[1] = {
    ...scored.results[0].assertions[1],
    passed: false,
    evidenceQuote: 'Evidence is the focused unit test.',
  };
  scored.results[0].hard = 0;
  scored.results[0].soft = 0.5;
  scored.summary = { trainHard: 0, validationHard: 1, overallHard: 0.5 };

  const result = validateTrainingEvidence({ tasks, raw, scored });

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((entry) => entry.code === 'failed_quote_must_be_empty'));
});

test('拒绝题集漂移和伪造的结果分数', () => {
  const { raw, scored } = validArtifacts();
  scored.results[0].split = 'validation';
  scored.results[0].hard = 0;
  scored.results[0].soft = 0.5;
  scored.summary = { trainHard: 0, validationHard: 1, overallHard: 0.5 };

  const result = validateTrainingEvidence({ tasks, raw, scored });

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((entry) => entry.code === 'split_mismatch'));
  assert.ok(result.violations.some((entry) => entry.code === 'hard_not_derived_from_assertions'));
  assert.ok(result.violations.some((entry) => entry.code === 'soft_not_derived_from_assertions'));
});

test('拒绝不匹配已验证任务分数的汇总', () => {
  const { raw, scored } = validArtifacts();
  scored.summary.validationHard = 0.5;

  const result = validateTrainingEvidence({ tasks, raw, scored });

  assert.equal(result.valid, false);
  assert.ok(result.violations.some((entry) => entry.code === 'summary_metric_mismatch'));
});
