import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { validateTrainingEvidence } from '../lib/skills/training-evidence-validator.mjs';

const ROOT = process.cwd();
const TRAINING_ROOT = path.join(ROOT, '.skillopt', 'rex-strict-tdd-2026-07-18');

async function readJson(...segments) {
  return JSON.parse((await readFile(path.join(...segments), 'utf8')).replace(/^\uFEFF/, ''));
}

test('rex-strict-tdd 在留出集硬分饱和时保留正式基线', async () => {
  const [train, validation, gate, state, canonical] = await Promise.all([
    readJson(TRAINING_ROOT, 'tasks', 'train.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0001', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'state.json'),
    readFile(path.join(ROOT, 'rex-harness', 'skill-sources', 'rex-strict-tdd', 'SKILL.md'), 'utf8'),
  ]);
  const tasks = [...train, ...validation];
  assert.equal(tasks.length, 15);
  for (const key of ['control', 'baseline', 'candidate']) {
    const [raw, scored] = await Promise.all([
      readJson(TRAINING_ROOT, `${key}_raw.json`),
      readJson(TRAINING_ROOT, `${key}_scored.json`),
    ]);
    const report = validateTrainingEvidence({ tasks, raw, scored });
    assert.equal(report.valid, true, key);
    assert.equal(report.metrics.trainHard, 1, key);
    assert.equal(report.metrics.validationHard, 1, key);
  }
  assert.equal(gate.action, 'reject_non_discriminating_hard_score_saturation');
  assert.equal(state.status, 'no_proven_improvement');
  assert.equal(state.canonicalAction, 'retain_baseline');
  assert.equal(state.frozenBaselineHash, createHash('sha256').update(canonical).digest('hex'));
});
