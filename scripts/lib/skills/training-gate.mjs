import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SKILL_PATHS = Object.freeze([
  'skill-sources/**/SKILL.md',
  'rex-harness/skill-sources/**/SKILL.md',
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

async function findSkillOptEvidence(rootDir, skillId, currentSkillHash) {
  const skillOptRoot = path.join(rootDir, '.skillopt');
  let entries;
  try {
    entries = await fs.readdir(skillOptRoot, { withFileTypes: true });
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { evidence: null, staleRefs: [] };
    throw error;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  let bestEvidence = null;
  let bestScore = -1;
  const staleRefs = [];

  for (const dirName of candidates) {
    const statePath = path.join(skillOptRoot, dirName, 'state.json');
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
    const score = typeof state.metrics?.complianceScore === 'number' ? state.metrics.complianceScore
      : typeof state.metrics?.bestHard === 'number' ? state.metrics.bestHard
      : 0;
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

  return { evidence: bestEvidence, staleRefs };
}

function gitSkillFiles(rootDir, args) {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\\/gu, '/'))
    .filter(Boolean);
}

function changedSkillFilesFromGit({ rootDir, base }) {
  const tracked = gitSkillFiles(rootDir, ['diff', '--name-only', base, '--', ...SKILL_PATHS]);
  const untracked = gitSkillFiles(rootDir, ['ls-files', '--others', '--exclude-standard', '--', ...SKILL_PATHS]);

  // 新建的 Skill 不会出现在 git diff 中，发布门必须同时覆盖未跟踪文件。
  return [...new Set([...tracked, ...untracked])].sort();
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
      ? await findSkillOptEvidence(rootDir, skillId, currentSkillHash)
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
          ? 'accepted SkillOpt evidence is stale or missing the hash of the current Skill content'
          : 'changed skill requires accepted SkillOpt training evidence with non-regression proof and a matching content hash',
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

function renderSkillTrainingGateText(report) {
  const lines = [`AIOS skill training gate: ${report.status}`];
  for (const skill of report.skills) {
    lines.push(`- ${skill.skillId}: ${skill.status}${skill.reason ? ` (${skill.reason})` : ''}`);
  }
  if (report.skills.length === 0) lines.push('- no changed skill sources detected');
  return `${lines.join('\n')}\n`;
}
