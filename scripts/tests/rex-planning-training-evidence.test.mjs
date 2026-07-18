import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { validateTrainingEvidence } from '../lib/skills/training-evidence-validator.mjs';

const ROOT = process.cwd();
const TRAINING_ROOT = path.join(ROOT, '.skillopt', 'rex-planning-2026-07-17');
const CANONICAL_SKILL = path.join(ROOT, 'rex-harness', 'skill-sources', 'rex-planning', 'SKILL.md');

async function readJson(...segments) {
  return JSON.parse(await readFile(path.join(...segments), 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('rex-planning 保留基线，不接受无效评分器产生的候选', async () => {
  const [train, validation, controlRaw, controlScored, baselineRaw, baselineScored, candidateRaw, candidateScored, gate, state, canonical] = await Promise.all([
    readJson(TRAINING_ROOT, 'tasks', 'train.json'),
    readJson(TRAINING_ROOT, 'tasks', 'valid.json'),
    readJson(TRAINING_ROOT, 'control_raw.json'),
    readJson(TRAINING_ROOT, 'control_scored.json'),
    readJson(TRAINING_ROOT, 'baseline_raw.json'),
    readJson(TRAINING_ROOT, 'baseline_scored.json'),
    readJson(TRAINING_ROOT, 'candidate_raw.json'),
    readJson(TRAINING_ROOT, 'candidate_scored.json'),
    readJson(TRAINING_ROOT, 'steps', 'step_0001', 'gate_result.json'),
    readJson(TRAINING_ROOT, 'state.json'),
    readFile(CANONICAL_SKILL, 'utf8'),
  ]);
  const tasks = [...train, ...validation];
  const control = validateTrainingEvidence({ tasks, raw: controlRaw, scored: controlScored });
  const baseline = validateTrainingEvidence({ tasks, raw: baselineRaw, scored: baselineScored });
  const candidate = validateTrainingEvidence({ tasks, raw: candidateRaw, scored: candidateScored });

  assert.equal(tasks.length, 15);
  assert.equal(control.valid, false);
  assert.equal(baseline.valid, true);
  assert.equal(candidate.valid, false);
  assert.deepEqual(control.violations.map((entry) => entry.code), ['summary_metric_mismatch']);
  assert.deepEqual(candidate.violations.map((entry) => entry.code), ['summary_metric_mismatch']);
  assert.equal(gate.action, 'reject_invalid_scorer_evidence');
  assert.equal(state.status, 'no_proven_improvement');
  assert.equal(state.canonicalAction, 'retain_baseline');
  assert.equal(state.frozenBaselineHash, sha256(canonical));
  assert.equal(gate.baselineHash, sha256(canonical));
});
