import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { certifySkillTraining, validateCertifiedTrainingEvidence } from '../lib/skills/training-certification.mjs';
import { runSkillTrainingCertification, verifySkillTrainingGate } from '../lib/skills/training-gate.mjs';

async function createGitSkillFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-training-certification-'));
  const relativeSkillPath = 'skill-sources/release-safety/SKILL.md';
  const skillPath = path.join(rootDir, relativeSkillPath);
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(skillPath, [
    '---',
    'name: release-safety',
    'description: Verify a release before publishing it.',
    '---',
    '',
    '# Release Safety',
    '',
    '1. Run the release checks.',
    '2. Record the command results.',
    '3. Publish only when every required check passes.',
    '',
  ].join('\n'), 'utf8');
  execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Training Fixture'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'baseline'], { cwd: rootDir, stdio: 'ignore' });
  await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\nUse the recorded evidence instead of claiming a pass.\n`, 'utf8');
  return { rootDir, relativeSkillPath, skillPath };
}

test('training certification records reproducible evidence and rejects a forged raw response', async () => {
  const fixture = await createGitSkillFixture();
  const certification = await certifySkillTraining({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });

  assert.equal(certification.status, 'verified', JSON.stringify(certification));
  assert.equal(certification.skills[0].status, 'accepted');

  const state = JSON.parse(await readFile(certification.skills[0].statePath, 'utf8'));
  const directValidation = await validateCertifiedTrainingEvidence({
    rootDir: fixture.rootDir,
    statePath: certification.skills[0].statePath,
    state,
    skillId: 'release-safety',
    sourcePath: fixture.relativeSkillPath,
    currentSkillHash: state.acceptedSkillHash,
    base: 'HEAD',
  });
  assert.equal(directValidation.ok, true, JSON.stringify(directValidation));
  const verified = await verifySkillTrainingGate({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });
  assert.equal(verified.status, 'verified', JSON.stringify(verified));

  const candidateRawPath = path.join(path.dirname(certification.skills[0].statePath), state.artifacts.candidateRaw);
  const candidateRaw = JSON.parse(await readFile(candidateRawPath, 'utf8'));
  candidateRaw.results[0].targetResponse = '{"forged":true}';
  await writeFile(candidateRawPath, `${JSON.stringify(candidateRaw, null, 2)}\n`, 'utf8');

  const blocked = await verifySkillTrainingGate({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.skills[0].reason, /evidence/i);

  let output = '';
  const cliResult = await runSkillTrainingCertification(
    { changed: true, base: 'HEAD', json: true },
    { rootDir: fixture.rootDir, stdout: { write: (chunk) => { output += String(chunk); } } },
  );
  assert.equal(cliResult.exitCode, 0, JSON.stringify(cliResult.report));
  assert.equal(JSON.parse(output).status, 'verified');

  const newSkillPath = path.join(fixture.rootDir, 'skill-sources', 'new-release-safety', 'SKILL.md');
  await mkdir(path.dirname(newSkillPath), { recursive: true });
  await writeFile(newSkillPath, '---\nname: new-release-safety\ndescription: Use when testing new release safety behavior.\n---\n# New Release Safety\n\n- Record reproducible evidence.\n', 'utf8');
  const newSkillCertification = await certifySkillTraining({
    rootDir: fixture.rootDir,
    changedFiles: ['skill-sources/new-release-safety/SKILL.md'],
    base: 'HEAD',
  });
  assert.equal(newSkillCertification.status, 'verified', JSON.stringify(newSkillCertification));
  const newSkillState = JSON.parse(await readFile(newSkillCertification.skills[0].statePath, 'utf8'));
  assert.equal(newSkillState.baseline.kind, 'no-skill-control');
});
