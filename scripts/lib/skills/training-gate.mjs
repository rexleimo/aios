import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { certifySkillTraining, validateCertifiedTrainingEvidence } from './training-certification.mjs';

const SKILL_PATHS = Object.freeze([
  'skill-sources/**/SKILL.md',
  'rex-harness/skill-sources/**/SKILL.md',
]);

const NESTED_SKILL_REPOSITORIES = Object.freeze([
  Object.freeze({ rootPath: 'rex-harness', skillPaths: Object.freeze(['skill-sources/**/SKILL.md']) }),
]);

function normalizeSkillIdFromPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)skill-sources\/(.+)\/SKILL\.md$/);
  return match ? match[1] : '';
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code) || error instanceof SyntaxError) return null;
    throw error;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function findTrainingEvidence(rootDir, skillId, sourcePath, currentSkillHash, base) {
  let bestEvidence = null;
  let bestScore = -1;
  const staleRefs = [];
  const evidenceRoots = [
    path.join(rootDir, 'docs', 'evidence', 'skill-training'),
    // Legacy records remain inspectable, but V1 state files cannot satisfy the
    // V2 certification validator below.
    path.join(rootDir, '.skillopt'),
  ];

  for (const evidenceRoot of evidenceRoots) {
    let entries;
    try {
      entries = await fs.readdir(evidenceRoot, { withFileTypes: true });
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error?.code)) continue;
      throw error;
    }
    const candidates = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const dirName of candidates) {
      const statePath = path.join(evidenceRoot, dirName, 'state.json');
      const state = await readJson(statePath);
      if (!state) continue;
      const stateSkillId = String(state.skillId || '').replace(/\\/g, '/');
      if (stateSkillId ? stateSkillId !== skillId : !dirName.startsWith(`${skillId}-`)) continue;
      const accepted = ['accepted', 'pass', 'passed', 'verified'].includes(String(state.status || state.gate || state.result || '').toLowerCase());
      const nonRegression = state.nonRegression === true || state.non_regression === true || state.regression === false;
      if (!accepted || !nonRegression) continue;
      const acceptedSkillHash = String(state.acceptedSkillHash || state.accepted_skill_hash || '').trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/u.test(acceptedSkillHash) || acceptedSkillHash !== currentSkillHash) {
        staleRefs.push(path.relative(rootDir, statePath).replace(/\\/gu, '/'));
        continue;
      }
      const certified = await validateCertifiedTrainingEvidence({
        rootDir,
        statePath,
        state,
        skillId,
        sourcePath,
        currentSkillHash,
        base,
      });
      if (!certified.ok) {
        staleRefs.push(path.relative(rootDir, statePath).replace(/\\/gu, '/'));
        continue;
      }
      const score = certified.score;
      if (score > bestScore) {
        bestScore = score;
        bestEvidence = {
          status: 'accepted',
          ref: path.relative(rootDir, statePath).replace(/\\/gu, '/'),
          score,
          acceptedSkillHash,
        };
      }
    }
  }

  return { evidence: bestEvidence, staleRefs };
}

function runGit(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout : null;
}

function parseGitFiles(output) {
  return String(output || '')
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\\/gu, '/'))
    .filter(Boolean);
}

function gitSkillFiles(rootDir, args) {
  return parseGitFiles(runGit(rootDir, args));
}

function readGitlinkRevision(rootDir, base, relativePath) {
  const output = runGit(rootDir, ['ls-tree', base, '--', relativePath]);
  const match = String(output || '').match(/^160000 commit ([0-9a-f]{40}|[0-9a-f]{64})\t/mu);
  return match ? match[1] : null;
}

function rootReportsNestedChange(rootDir, base, relativePath) {
  return gitSkillFiles(rootDir, ['diff', '--name-only', base, '--', relativePath])
    .includes(relativePath);
}

function isGitWorktreeRoot(directory) {
  // A directory inside the outer repository inherits its Git metadata; only an
  // empty prefix proves it is the root of an independently nested worktree.
  const prefix = runGit(directory, ['rev-parse', '--show-prefix']);
  return prefix !== null && prefix.trim() === '';
}

function nestedSkillFilesFromGit({ rootDir, base }) {
  const files = [];
  for (const repository of NESTED_SKILL_REPOSITORIES) {
    const nestedRoot = path.join(rootDir, repository.rootPath);
    if (!isGitWorktreeRoot(nestedRoot)) continue;
    const gitlinkRevision = readGitlinkRevision(rootDir, base, repository.rootPath);
    const nestedChangedAtRoot = rootReportsNestedChange(rootDir, base, repository.rootPath);
    const baseline = gitlinkRevision || 'HEAD';
    const trackedOutput = runGit(nestedRoot, [
      'diff', '--name-only', baseline, '--', ...repository.skillPaths,
    ]);
    const untracked = gitSkillFiles(nestedRoot, [
      'ls-files', '--others', '--exclude-standard', '--', ...repository.skillPaths,
    ]);
    let tracked = parseGitFiles(trackedOutput);

    // A newly added gitlink or an unavailable historical object cannot yield a
    // trustworthy diff. Require training for every current nested Skill instead.
    if (trackedOutput === null || (!gitlinkRevision && nestedChangedAtRoot)) {
      tracked = gitSkillFiles(nestedRoot, ['ls-files', '--', ...repository.skillPaths]);
    }

    for (const filePath of [...tracked, ...untracked]) {
      files.push(path.posix.join(repository.rootPath, filePath));
    }
  }
  return files;
}

function changedSkillFilesFromGit({ rootDir, base }) {
  const tracked = gitSkillFiles(rootDir, ['diff', '--name-only', base, '--', ...SKILL_PATHS]);
  const untracked = gitSkillFiles(rootDir, ['ls-files', '--others', '--exclude-standard', '--', ...SKILL_PATHS]);
  const nested = nestedSkillFilesFromGit({ rootDir, base });

  // 新建的 Skill 不会出现在 git diff 中，发布门必须同时覆盖未跟踪文件和嵌套 Rex 工作区。
  return [...new Set([...tracked, ...untracked, ...nested])].sort();
}

async function hashSkillFile(rootDir, filePath) {
  try {
    return sha256(await fs.readFile(path.resolve(rootDir, filePath)));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    throw error;
  }
}

export async function verifySkillTrainingGate({ rootDir = process.cwd(), changedFiles = null, base = 'HEAD' } = {}) {
  const files = [...new Set(
    (Array.isArray(changedFiles) ? changedFiles : changedSkillFilesFromGit({ rootDir, base }))
      .map((filePath) => String(filePath).replace(/\\/gu, '/')),
  )].sort();
  const skillFiles = new Map();
  for (const filePath of files) {
    const skillId = normalizeSkillIdFromPath(filePath);
    if (skillId && !skillFiles.has(skillId)) skillFiles.set(skillId, filePath);
  }
  const skillIds = [...skillFiles.keys()].sort();
  const skills = [];
  for (const skillId of skillIds) {
    const currentSkillHash = await hashSkillFile(rootDir, skillFiles.get(skillId));
    const evidenceResult = currentSkillHash
      ? await findTrainingEvidence(rootDir, skillId, skillFiles.get(skillId), currentSkillHash, base)
      : { evidence: null, staleRefs: [] };
    skills.push(evidenceResult.evidence ? {
      skillId,
      status: 'verified',
      evidence: evidenceResult.evidence,
    } : {
      skillId,
      status: 'blocked',
      reason: currentSkillHash === null
        ? 'changed skill source is unavailable for content-hash verification'
        : evidenceResult.staleRefs.length > 0
          ? 'accepted training evidence is stale, incomplete, or missing the hash of the current Skill content'
          : 'changed skill requires accepted, reproducible training evidence with non-regression proof and a matching content hash',
    });
  }
  const blocked = skills.filter((skill) => skill.status !== 'verified');
  return {
    schemaVersion: 1,
    kind: 'aios.skill-training-gate.v1',
    status: blocked.length > 0 ? 'blocked' : 'verified',
    changedFiles: files,
    skills,
  };
}

export async function runSkillTrainingGate(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const report = await verifySkillTrainingGate({
    rootDir,
    base: options.base || 'HEAD',
  });
  const json = options.json || options.format === 'json';
  if (json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else stdout.write(renderSkillTrainingGateText(report));
  return { exitCode: report.status === 'verified' ? 0 : 1, report };
}

export async function runSkillTrainingCertification(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const base = options.base || 'HEAD';
  const report = await certifySkillTraining({
    rootDir,
    changedFiles: changedSkillFilesFromGit({ rootDir, base }),
    base,
  });
  const json = options.json || options.format === 'json';
  if (json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else stdout.write(renderSkillTrainingCertificationText(report));
  return { exitCode: report.status === 'verified' ? 0 : 1, report };
}

function renderSkillTrainingGateText(report) {
  const lines = [`AIOS skill training gate: ${report.status}`];
  for (const skill of report.skills) {
    lines.push(`- ${skill.skillId}: ${skill.status}${skill.reason ? ` (${skill.reason})` : ''}`);
  }
  if (report.skills.length === 0) lines.push('- no changed skill sources detected');
  return `${lines.join('\n')}\n`;
}

function renderSkillTrainingCertificationText(report) {
  const lines = [`AIOS skill training certification: ${report.status}`];
  for (const skill of report.skills) {
    lines.push(`- ${skill.skillId}: ${skill.status}${skill.statePath ? ` (${skill.statePath})` : ''}${skill.reason ? ` (${skill.reason})` : ''}`);
  }
  if (report.skills.length === 0) lines.push('- no changed skill sources detected');
  return `${lines.join('\n')}\n`;
}
