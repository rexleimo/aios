import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { validateTrainingEvidence } from '../lib/skills/training-evidence-validator.mjs';

const ROOT = process.cwd();
const SKILLS = ['rex-implement', 'rex-debug', 'rex-code-review', 'rex-wayfinder'];
async function readJson(file) { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('四项 v2 案例由 Gate 选择最佳版本', async () => {
  for (const skill of SKILLS) {
    const root = path.join(ROOT, '.skillopt', `${skill}-2026-07-18`);
    const tasks = [...await readJson(path.join(root, 'tasks', 'train-v2.json')), ...await readJson(path.join(root, 'tasks', 'valid.json'))];
    const reports = {};
    for (const key of ['control', 'baseline', 'candidate']) {
      reports[key] = validateTrainingEvidence({ tasks, raw: await readJson(path.join(root, `${key}_v2_raw.json`)), scored: await readJson(path.join(root, `${key}_v2_scored.json`)) });
      assert.equal(reports[key].valid, true, `${skill}:${key}`);
    }
    const metrics = Object.fromEntries(Object.entries(reports).map(([key, report]) => [key, report.metrics]));
    const candidateWins = metrics.candidate.validationHard > metrics.baseline.validationHard
      && metrics.candidate.trainHard >= metrics.baseline.trainHard
      && metrics.candidate.validationHard >= metrics.control.validationHard
      && metrics.candidate.trainHard >= metrics.control.trainHard;
    const gate = await readJson(path.join(root, 'steps', 'step_0002', 'gate_result.json'));
    assert.equal(gate.action, candidateWins ? 'accept_candidate' : 'retain_baseline', skill);
    const state = await readJson(path.join(root, 'state-v2.json'));
    assert.equal(state.canonicalAction, candidateWins ? 'candidate_selected' : 'retain_baseline', skill);
    const canonical = await readFile(path.join(ROOT, 'rex-harness', 'skill-sources', skill, 'SKILL.md'), 'utf8');
    if (candidateWins) {
      const candidate = await readFile(path.join(root, 'skills', 'skill_v0001.md'), 'utf8');
      const body = (value) => value.replace(/^---[\s\S]*?---\r?\n/, '');
      assert.equal(body(canonical), body(candidate), skill);
    } else {
      assert.equal(hash(canonical), gate.baselineHash, skill);
    }
  }
});
