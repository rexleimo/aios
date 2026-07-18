import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { validateTrainingEvidence } from '../lib/skills/training-evidence-validator.mjs';

const ROOT = process.cwd();
const TRAINING_ROOT = path.join(ROOT, '.skillopt', 'rex-minimal-construction-2026-07-18');
async function readJson(...segments) { return JSON.parse((await readFile(path.join(...segments), 'utf8')).replace(/^\uFEFF/, '')); }
test('rex-minimal-construction 拒绝以训练回退换取留出收益', async () => {
  const [train, validation, gate, state] = await Promise.all([readJson(TRAINING_ROOT, 'tasks', 'train.json'), readJson(TRAINING_ROOT, 'tasks', 'valid.json'), readJson(TRAINING_ROOT, 'steps', 'step_0001', 'gate_result.json'), readJson(TRAINING_ROOT, 'state.json')]);
  const metrics = {};
  for (const key of ['control', 'baseline', 'candidate']) { const report = validateTrainingEvidence({ tasks: [...train, ...validation], raw: await readJson(TRAINING_ROOT, `${key}_raw.json`), scored: await readJson(TRAINING_ROOT, `${key}_scored.json`) }); assert.equal(report.valid, true, key); metrics[key] = report.metrics; }
  assert.ok(metrics.candidate.validationHard > metrics.baseline.validationHard);
  assert.ok(metrics.candidate.trainHard < metrics.baseline.trainHard);
  assert.equal(gate.action, 'reject_train_regression');
  assert.equal(state.canonicalAction, 'retain_baseline');
});
