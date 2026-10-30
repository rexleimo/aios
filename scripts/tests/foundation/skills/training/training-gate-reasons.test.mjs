import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  classifyEvidenceFailure,
  runSkillTrainingCertification,
  runSkillTrainingGate,
  verifySkillTrainingGate,
} from '../../../../lib/tooling/skills/training/training-gate.mjs';

// 这些用例锁的是"门说的话能不能直接执行"。发布门过去把九种失效压成一句
// "stale, incomplete, or missing the hash"，于是操作者只能猜——实测猜错一次
// （用 --base HEAD 重出证）会让门继续红，而看起来像是没修。
const RELATIVE_SKILL_PATH = 'skill-sources/gate-reasons/SKILL.md';
const SKILL_ID = 'gate-reasons';

function skillText(extra = '') {
  return [
    '---',
    'name: gate-reasons',
    'description: Report why training evidence failed a release gate.',
    '---',
    '',
    '# Gate Reasons',
    '',
    '1. Read the blocked Skill entry.',
    '2. Name the base the gate validated against.',
    '3. Emit the certify command that clears it.',
    extra,
  ].join('\n');
}

function commitAll(rootDir, message) {
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', message], { cwd: rootDir, stdio: 'ignore' });
}

async function createReasonFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-training-gate-reasons-'));
  const skillPath = path.join(rootDir, RELATIVE_SKILL_PATH);
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(skillPath, skillText(), 'utf8');
  execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Training Fixture'], { cwd: rootDir });
  commitAll(rootDir, 'baseline');
  // 工作树里先改内容：证就在这一刻按 base=HEAD 出，存的 baseline 是旧 blob。
  await writeFile(skillPath, skillText('4. Record the evidence path.\n'), 'utf8');
  return { rootDir, skillPath };
}

async function certifyAtHead(rootDir) {
  let output = '';
  const result = await runSkillTrainingCertification(
    { skill: [SKILL_ID], base: 'HEAD', json: true },
    { rootDir, stdout: { write: (chunk) => { output += String(chunk); } } },
  );
  assert.equal(result.exitCode, 0, output);
  assert.equal(JSON.parse(output).skills[0].status, 'accepted');
}

async function blockedEntry(report, skillId = SKILL_ID) {
  const entry = report.skills.find((skill) => skill.skillId === skillId);
  assert.ok(entry, `expected ${skillId} in ${JSON.stringify(report.skills)}`);
  assert.equal(entry.status, 'blocked');
  return entry;
}

test('R1 a cert recorded at another base is reported as a base mismatch, not as stale content', async () => {
  const { rootDir } = await createReasonFixture();
  await certifyAtHead(rootDir);
  // 提交后 git show HEAD == 当前内容，但证据里存的 baseline 仍是旧 blob：
  // 这正是"按 --base HEAD 出证、发布门按上一个 tag 校验"的真实形状。
  commitAll(rootDir, 'skill update');

  const report = await verifySkillTrainingGate({ rootDir, base: 'HEAD', changedFiles: [RELATIVE_SKILL_PATH] });
  const entry = await blockedEntry(report);
  assert.equal(entry.code, 'baseline-differs-from-git-base');
  assert.equal(entry.reasonKind, 'certification-base-mismatch');
  assert.match(entry.remedy, new RegExp(`--skill ${SKILL_ID} --base HEAD`));
});

test('R2 a cert for different Skill content is reported as stale content', async () => {
  const { rootDir, skillPath } = await createReasonFixture();
  await certifyAtHead(rootDir);
  await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}5. Move the goalposts.\n`, 'utf8');

  const entry = await blockedEntry(await verifySkillTrainingGate({
    rootDir,
    base: 'HEAD',
    changedFiles: [RELATIVE_SKILL_PATH],
  }));
  assert.equal(entry.code, 'accepted-hash-differs-from-current-skill');
  assert.equal(entry.reasonKind, 'stale-content');
  assert.match(entry.remedy, /--base HEAD$/u);
});

test('R3 a Skill with no accepted evidence names the certify command that would create it', async () => {
  const { rootDir } = await createReasonFixture();
  commitAll(rootDir, 'skill update');

  const entry = await blockedEntry(await verifySkillTrainingGate({
    rootDir,
    base: 'HEAD',
    changedFiles: [RELATIVE_SKILL_PATH],
  }));
  assert.equal(entry.code, 'no-accepted-evidence');
  assert.equal(entry.reasonKind, 'missing-evidence');
  assert.equal(
    entry.remedy,
    `node scripts/aios.mjs skill certify --skill ${SKILL_ID} --base HEAD`,
  );
});

test('R4 an unreadable Skill source is not sold a remedy that cannot work', async () => {
  const { rootDir, skillPath } = await createReasonFixture();
  await rm(skillPath, { force: true });

  const entry = await blockedEntry(await verifySkillTrainingGate({
    rootDir,
    base: 'HEAD',
    changedFiles: [RELATIVE_SKILL_PATH],
  }));
  assert.equal(entry.code, 'skill-source-unavailable');
  assert.equal(entry.reasonKind, 'unreadable-input');
  assert.equal(entry.remedy, '', 'certify reads the same file, so it cannot be the remedy');
});

test('R5 every declared failure code maps to a kind; unknown codes stay unclassified', () => {
  const declaredCodes = [
    'baseline-differs-from-git-base',
    'baseline-artifact-tampered',
    'accepted-hash-differs-from-current-skill',
    'skill-identity-or-hash-mismatch',
    'accepted-hash-malformed',
    'evidence-schema-v2-missing',
    'artifact-path-unsafe-or-missing',
    'artifacts-incomplete-or-unreadable',
    'result-not-accepted-non-regression',
    'baseline-run-not-reproducible',
    'candidate-run-not-reproducible',
    'scenarios-regress-or-incomplete-pass',
    'current-skill-unreadable',
    'git-baseline-unreadable',
    'skill-source-unavailable',
  ];
  for (const code of declaredCodes) {
    assert.notEqual(
      classifyEvidenceFailure(code),
      'unclassified-evidence-failure',
      `${code} is emitted by the validator but not classified by the gate`,
    );
  }
  assert.equal(classifyEvidenceFailure('made-up-code'), 'unclassified-evidence-failure');
});

test('R7 a registered rename verifies the retired id against its successor evidence', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-training-gate-rename-'));
  const oldPath = 'skill-sources/aios-long-running-harness/SKILL.md';
  const newPath = 'skill-sources/aios-harness/SKILL.md';
  const newFile = path.join(rootDir, newPath);
  try {
    await mkdir(path.dirname(newFile), { recursive: true });
    await writeFile(newFile, skillText().replace('gate-reasons', 'aios-harness'), 'utf8');
    execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Training Fixture'], { cwd: rootDir });
    commitAll(rootDir, 'baseline');
    await writeFile(newFile, `${await readFile(newFile, 'utf8')}4. Record the evidence path.\n`, 'utf8');
    let output = '';
    const certified = await runSkillTrainingCertification(
      { skill: ['aios-harness'], base: 'HEAD', json: true },
      { rootDir, stdout: { write: (chunk) => { output += String(chunk); } } },
    );
    assert.equal(certified.exitCode, 0, output);

    const report = await verifySkillTrainingGate({ rootDir, base: 'HEAD', changedFiles: [newPath, oldPath] });
    assert.equal(report.status, 'verified', JSON.stringify(report.skills));
    const retired = report.skills.find((skill) => skill.skillId === 'aios-long-running-harness');
    assert.equal(retired.status, 'verified');
    assert.equal(retired.supersededBy, 'aios-harness');
    assert.equal(retired.code, 'superseded-by-rename');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('R8 a deleted Skill with no registered successor stays an unreadable input', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-training-gate-deleted-'));
  try {
    execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Training Fixture'], { cwd: rootDir });
    await mkdir(path.join(rootDir, 'skill-sources', 'gate-reasons'), { recursive: true });
    await writeFile(path.join(rootDir, RELATIVE_SKILL_PATH), skillText(), 'utf8');
    commitAll(rootDir, 'baseline');
    await rm(path.join(rootDir, RELATIVE_SKILL_PATH), { force: true });

    const report = await verifySkillTrainingGate({ rootDir, base: 'HEAD', changedFiles: [RELATIVE_SKILL_PATH] });
    const entry = await blockedEntry(report);
    assert.equal(entry.code, 'skill-source-unavailable');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('R6 the text report surfaces the remedy so a human sees it without --json', async () => {
  const { rootDir } = await createReasonFixture();
  await certifyAtHead(rootDir);
  commitAll(rootDir, 'skill update');

  let output = '';
  const result = await runSkillTrainingGate(
    { skill: [SKILL_ID], base: 'HEAD' },
    { rootDir, stdout: { write: (chunk) => { output += String(chunk); } } },
  );
  assert.equal(result.exitCode, 1);
  assert.match(output, /certification-base-mismatch|Git baseline/u);
  assert.match(output, /remedy: node scripts\/aios\.mjs skill certify --skill gate-reasons --base HEAD/u);
});
