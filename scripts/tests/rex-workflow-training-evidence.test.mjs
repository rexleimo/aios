import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { verifySkillTrainingGate } from '../lib/skills/training-gate.mjs';
import { createSkillTrainingGateFixture } from './fixtures/skill-training-gate.mjs';

const ROOT = process.cwd();
const SKILL_ID = 'rex-workflow';

test('rex-workflow training gate is hermetic and does not accept stale fixture state', async () => {
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
    assert.equal(blocked.skills[0].reason, 'changed skill requires accepted, reproducible training evidence with non-regression proof and a matching content hash');

    await fixture.writeAcceptedState();
    const verified = await verifySkillTrainingGate({
      rootDir: fixture.rootDir,
      changedFiles: [fixture.relativeSkillPath],
    });
    assert.equal(verified.status, 'verified');
    assert.equal(verified.skills[0].evidence.acceptedSkillHash.length, 64);

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
