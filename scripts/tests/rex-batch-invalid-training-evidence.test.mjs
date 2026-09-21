import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { verifySkillTrainingGate } from '../lib/skills/training-gate.mjs';
import { createSkillTrainingGateFixture } from './fixtures/skill-training-gate.mjs';

const ROOT = process.cwd();
const SKILL_ID = 'rex-implement';

test('被篡改的评分器工件不能通过训练门禁升级 rex 正式 Skill', async () => {
  const fixture = await createSkillTrainingGateFixture({
    sourceSkillPath: path.join(ROOT, 'rex-harness', 'skill-sources', SKILL_ID, 'SKILL.md'),
    skillId: SKILL_ID,
  });
  try {
    const statePath = await fixture.writeAcceptedState();
    const clean = await verifySkillTrainingGate({
      rootDir: fixture.rootDir,
      changedFiles: [fixture.relativeSkillPath],
    });
    assert.equal(clean.status, 'verified', '未经污染的 accepted 证据必须先通过门禁');

    const scoredPath = path.join(path.dirname(statePath), 'candidate.scored.json');
    const scored = JSON.parse(await readFile(scoredPath, 'utf8'));
    scored.summary = { ...scored.summary, trainHard: Number(scored.summary?.trainHard ?? 0) + 1 };
    await writeFile(scoredPath, `${JSON.stringify(scored, null, 2)}\n`, 'utf8');

    const tampered = await verifySkillTrainingGate({
      rootDir: fixture.rootDir,
      changedFiles: [fixture.relativeSkillPath],
    });
    assert.equal(tampered.status, 'blocked');
    assert.deepEqual(
      tampered.skills.map((skill) => [skill.skillId, skill.status]),
      [[SKILL_ID, 'blocked']],
    );
    assert.match(tampered.skills[0].reason, /stale|incomplete|hash|evidence/u);
  } finally {
    await fixture.cleanup();
  }
});
