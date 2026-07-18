import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { validateTrainingEvidence } from '../lib/skills/training-evidence-validator.mjs';

const ROOT = process.cwd();
const SKILLS = ['rex-implement', 'rex-debug', 'rex-code-review', 'rex-wayfinder'];

async function readJson(file) {
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

function taskList(value) {
  return Array.isArray(value) ? value : value.tasks;
}

test('无效的批量 Target/Scorer 工件不能升级 rex 正式 Skill', async () => {
  for (const skill of SKILLS) {
    const root = path.join(ROOT, '.skillopt', `${skill}-2026-07-18`);
    const [train, valid, gate, state, canonical] = await Promise.all([
      readJson(path.join(root, 'tasks', 'train.json')),
      readJson(path.join(root, 'tasks', 'valid.json')),
      readJson(path.join(root, 'steps', 'step_0001', 'gate_result.json')),
      readJson(path.join(root, 'state.json')),
      readFile(path.join(ROOT, 'rex-harness', 'skill-sources', skill, 'SKILL.md'), 'utf8'),
    ]);
    const tasks = [...taskList(train), ...taskList(valid)];
    for (const key of ['control', 'baseline', 'candidate']) {
      const report = validateTrainingEvidence({
        tasks,
        raw: await readJson(path.join(root, `${key}_raw.json`)),
        scored: await readJson(path.join(root, `${key}_scored.json`)),
      });
      assert.equal(report.valid, false, `${skill}:${key} must remain invalid`);
    }
    assert.equal(gate.action, 'reject_invalid_scorer_evidence');
    assert.equal(state.status, 'no_proven_improvement');
    assert.equal(state.canonicalAction, 'retain_baseline');
    assert.equal(state.frozenBaselineHash, createHash('sha256').update(canonical).digest('hex'));
  }
});
