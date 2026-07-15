import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

async function findSkillOptEvidence(rootDir, skillId) {
  const skillOptRoot = path.join(rootDir, '.skillopt');
  let entries;
  try {
    entries = await fs.readdir(skillOptRoot, { withFileTypes: true });
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    throw error;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  let bestEvidence = null;
  let bestScore = -1;

  for (const dirName of candidates) {
    const statePath = path.join(skillOptRoot, dirName, 'state.json');
    const state = await readJson(statePath);
    if (!state) continue;
    const stateSkillId = String(state.skillId || '').replace(/\\/g, '/');
    if (stateSkillId ? stateSkillId !== skillId : !dirName.startsWith(`${skillId}-`)) continue;
    const accepted = ['accepted', 'pass', 'passed', 'verified'].includes(String(state.status || state.gate || state.result || '').toLowerCase());
    const nonRegression = state.nonRegression === true || state.non_regression === true || state.regression === false;
    if (!accepted || !nonRegression) continue;
    const score = typeof state.metrics?.complianceScore === 'number' ? state.metrics.complianceScore
      : typeof state.metrics?.bestHard === 'number' ? state.metrics.bestHard
      : 0;
    if (score > bestScore) {
      bestScore = score;
      bestEvidence = {
        status: 'accepted',
        ref: path.relative(rootDir, statePath),
        score,
      };
    }
  }

  return bestEvidence;
}

function changedSkillFilesFromGit({ rootDir, base }) {
  const result = spawnSync('git', ['diff', '--name-only', base, '--', 'skill-sources/**/SKILL.md'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

export async function verifySkillTrainingGate({ rootDir = process.cwd(), changedFiles = null, base = 'HEAD' } = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles : changedSkillFilesFromGit({ rootDir, base });
  const skillIds = [...new Set(files.map(normalizeSkillIdFromPath).filter(Boolean))].sort();
  const skills = [];
  for (const skillId of skillIds) {
    const evidence = await findSkillOptEvidence(rootDir, skillId);
    skills.push(evidence ? {
      skillId,
      status: 'verified',
      evidence,
    } : {
      skillId,
      status: 'blocked',
      reason: 'changed skill requires accepted SkillOpt training evidence with non-regression proof',
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
