import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { verifySkillTrainingGate } from '../../lib/skills/training-gate.mjs';

export function skillSourcePath(skillId) {
  return path.posix.join('rex-harness', 'skill-sources', skillId, 'SKILL.md');
}

async function hashSkillInTree(rootDir, skillId) {
  const text = await readFile(path.join(rootDir, skillSourcePath(skillId)), 'utf8');
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Freshness contract that replaced the July `.skillopt/` pins: the Skill
 * content in the tree must be covered by tracked, reproducible V2
 * certification evidence whose accepted hash matches it. `.skillopt/` is
 * gitignored and absent from a clean checkout, so
 * `docs/evidence/skill-training` is the only auditable source; refresh it
 * with `aios skill certify` after editing a Skill.
 */
export async function assertFreshTrainingEvidence(rootDir, skillId) {
  const report = await verifySkillTrainingGate({ rootDir, changedFiles: [skillSourcePath(skillId)] });
  const skill = report.skills.find((entry) => entry.skillId === skillId);
  assert.ok(skill, `${skillId}: the training gate did not report this Skill`);
  assert.equal(skill.status, 'verified', `${skillId}: ${skill.reason || 'no accepted evidence'}`);
  assert.equal(report.status, 'verified');

  const ref = skill.evidence.ref;
  assert.ok(
    ref.startsWith(`docs/evidence/skill-training/${skillId}-certification-`),
    `${skillId}: evidence must live under the tracked certification directory (got ${ref})`,
  );
  assert.ok(ref.endsWith('/state.json'), `${skillId}: evidence ref must point at state.json (got ${ref})`);

  const state = JSON.parse(await readFile(path.join(rootDir, ref), 'utf8'));
  assert.equal(state.schemaVersion, 2, `${skillId}: only V2 certification evidence can satisfy the gate`);
  assert.equal(state.status, 'accepted');
  assert.equal(state.nonRegression, true);
  assert.equal(
    state.acceptedSkillHash,
    await hashSkillInTree(rootDir, skillId),
    `${skillId}: accepted hash must match the Skill content in the tree`,
  );
  return ref;
}
