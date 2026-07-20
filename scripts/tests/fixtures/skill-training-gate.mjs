import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { certifySkillTraining } from '../../lib/skills/training-certification.mjs';

/**
 * Test-only Git fixture that produces the same auditable V2 artifacts used by
 * the release gate. It never writes a hand-crafted accepted state.
 */
export async function createSkillTrainingGateFixture({ sourceSkillPath, skillId }) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-skill-training-gate-'));
  const relativeSkillPath = path.posix.join('rex-harness', 'skill-sources', skillId, 'SKILL.md');
  const skillPath = path.join(rootDir, relativeSkillPath);
  const skillText = await readFile(sourceSkillPath, 'utf8');
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(skillPath, skillText, 'utf8');
  execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Training Fixture'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'baseline'], { cwd: rootDir, stdio: 'ignore' });
  await writeFile(skillPath, `${skillText}\nFixture candidate change.\n`, 'utf8');

  return {
    rootDir,
    skillId,
    relativeSkillPath,
    skillPath,
    skillText,
    async writeAcceptedState() {
      const certification = await certifySkillTraining({
        rootDir,
        changedFiles: [relativeSkillPath],
        base: 'HEAD',
      });
      if (certification.status !== 'verified' || !certification.skills[0]?.statePath) {
        throw new Error(`fixture certification failed: ${JSON.stringify(certification)}`);
      }
      return certification.skills[0].statePath;
    },
    async changeSkill() {
      await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\n# test-only stale hash\n`, 'utf8');
    },
    async cleanup() {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}
