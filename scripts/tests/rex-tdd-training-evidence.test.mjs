import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { verifySkillTrainingGate } from '../lib/skills/training-gate.mjs';
import { createSkillTrainingGateFixture } from './fixtures/skill-training-gate.mjs';

const ROOT = process.cwd();
const SKILL_ID = 'rex-tdd';

test('rex-tdd training gate is hermetic and fail-closed without live evidence', async () => {
  const fixture = await createSkillTrainingGateFixture({
    sourceSkillPath: path.join(ROOT, 'rex-harness', 'skill-sources', SKILL_ID, 'SKILL.md'),
    skillId: SKILL_ID,
  });
  try {
    const blocked = await verifySkillTrainingGate({
      rootDir: fixture.rootDir,
      changedFiles: [fixture.relativeSkillPath],
    });
    assert.equal(blocked.status, 'blocked');
    assert.deepEqual(blocked.skills.map((skill) => [skill.skillId, skill.status]), [[SKILL_ID, 'blocked']]);

    await fixture.writeAcceptedState();
    const verified = await verifySkillTrainingGate({
      rootDir: fixture.rootDir,
      changedFiles: [fixture.relativeSkillPath],
    });
    assert.equal(verified.status, 'verified');
    assert.match(verified.skills[0].evidence.ref, new RegExp(`^docs/evidence/skill-training/${SKILL_ID}-certification-.+/state\\.json$`));

    await fixture.changeSkill();
    const stale = await verifySkillTrainingGate({
      rootDir: fixture.rootDir,
      changedFiles: [fixture.relativeSkillPath],
    });
    assert.equal(stale.status, 'blocked');
    assert.match(stale.skills[0].reason, /stale|missing the hash/u);
  } finally {
    await fixture.cleanup();
  }
});
