import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { certifySkillTraining, validateCertifiedTrainingEvidence } from './training-certification.mjs';
import { collectSkillOutcomes } from './skill-gate-outcomes.mjs';

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
  const staleDetails = [];
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
      if (!/^[a-f0-9]{64}$/u.test(acceptedSkillHash)) {
        // 没有可用 hash 的证据根本不可核（V1 legacy 状态到这里），不能当成“内容过期”。
        const staleRef = path.relative(rootDir, statePath).replace(/\\/gu, '/');
        staleRefs.push(staleRef);
        staleDetails.push({
          ref: staleRef,
          code: 'accepted-hash-malformed',
          reason: 'certification state carries no accepted Skill content hash to verify against',
        });
        continue;
      }
      if (acceptedSkillHash !== currentSkillHash) {
        const staleRef = path.relative(rootDir, statePath).replace(/\\/gu, '/');
        staleRefs.push(staleRef);
        staleDetails.push({
          ref: staleRef,
          code: 'accepted-hash-differs-from-current-skill',
          reason: 'certification is stale: it was recorded for different Skill content than the Skill being checked',
        });
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
        const staleRef = path.relative(rootDir, statePath).replace(/\\/gu, '/');
        staleRefs.push(staleRef);
        staleDetails.push({
          ref: staleRef,
          code: String(certified.code || 'unclassified-evidence-failure'),
          reason: String(certified.reason || 'certification evidence rejected'),
        });
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

  return { evidence: bestEvidence, staleRefs, staleDetails };
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

// 门把证据失效原因映射成稳定 kind：九种不同失败不再压成同一句话，发布门也就能
// 直接指出该跑哪条 certify 命令。code 由 training-certification.mjs 声明，这里只查表，
// 不解析文本。
const EVIDENCE_FAILURE_KINDS = new Map([
  ['baseline-differs-from-git-base', 'certification-base-mismatch'],
  ['baseline-artifact-tampered', 'inconsistent-evidence'],
  ['accepted-hash-differs-from-current-skill', 'stale-content'],
  ['accepted-hash-malformed', 'incomplete-evidence'],
  ['skill-identity-or-hash-mismatch', 'stale-content'],
  ['evidence-schema-v2-missing', 'incomplete-evidence'],
  ['artifact-path-unsafe-or-missing', 'incomplete-evidence'],
  ['artifacts-incomplete-or-unreadable', 'incomplete-evidence'],
  ['result-not-accepted-non-regression', 'unaccepted-result'],
  ['baseline-run-not-reproducible', 'non-reproducible-run'],
  ['candidate-run-not-reproducible', 'non-reproducible-run'],
  ['scenarios-regress-or-incomplete-pass', 'non-reproducible-run'],
  ['current-skill-unreadable', 'unreadable-input'],
  ['git-baseline-unreadable', 'unreadable-input'],
  ['skill-source-unavailable', 'unreadable-input'],
]);
// 可修性排序：靠前的先报（同一 Skill 多份证据时取最值得动手的那条）。
const EVIDENCE_KIND_PRIORITY = [
  'certification-base-mismatch',
  'inconsistent-evidence',
  'stale-content',
  'missing-evidence',
  'non-reproducible-run',
  'unaccepted-result',
  'incomplete-evidence',
  'unreadable-input',
  'unclassified-evidence-failure',
];
export function classifyEvidenceFailure(code) {
  return EVIDENCE_FAILURE_KINDS.get(String(code || '')) || 'unclassified-evidence-failure';
}

function mostActionableDetail(details) {
  return [...details].sort((a, b) => {
    const rank = EVIDENCE_KIND_PRIORITY.indexOf(classifyEvidenceFailure(a.code))
      - EVIDENCE_KIND_PRIORITY.indexOf(classifyEvidenceFailure(b.code));
    if (rank !== 0) return rank;
    // 证据目录名是 ISO 时间戳，字典序即时间序；同优先级取最新那份。
    if (a.ref === b.ref) return 0;
    return a.ref < b.ref ? 1 : -1;
  })[0];
}

function describeBlockedSkill({ skillId, base, currentSkillHash, evidenceResult }) {
  const staleRefs = evidenceResult.staleRefs || [];
  const staleDetails = evidenceResult.staleDetails || [];
  if (currentSkillHash === null) {
    return {
      skillId,
      status: 'blocked',
      code: 'skill-source-unavailable',
      reasonKind: 'unreadable-input',
      staleRefs,
      remedy: '',
      reason: 'changed skill source is unavailable for content-hash verification',
    };
  }
  if (staleDetails.length === 0) {
    return {
      skillId,
      status: 'blocked',
      code: 'no-accepted-evidence',
      reasonKind: 'missing-evidence',
      staleRefs,
      reason: 'changed skill requires accepted, reproducible training evidence with non-regression proof and a matching content hash',
      remedy: certifyRemedy({ skillId, base }),
    };
  }
  const chosen = mostActionableDetail(staleDetails);
  const reasonKind = classifyEvidenceFailure(chosen.code);
  // 读不到当前内容时 certify 自身也会 blocked，不能把它当成修得好的命令递给人。
  const remedy = reasonKind === 'unreadable-input' ? '' : certifyRemedy({ skillId, base });
  return {
    skillId,
    status: 'blocked',
    code: chosen.code,
    reasonKind,
    staleRefs,
    reason: chosen.reason,
    remedy,
  };
}

function certifyRemedy({ skillId, base }) {
  return `node scripts/aios.mjs skill certify --skill ${skillId} --base ${base}`;
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
  const skills = await collectSkillOutcomes({
    skillIds,
    skillFiles,
    currentHash: (filePath) => hashSkillFile(rootDir, filePath),
    findEvidence: (skillId, sourcePath, currentSkillHash) => findTrainingEvidence(rootDir, skillId, sourcePath, currentSkillHash, base),
    describeBlocked: ({ skillId, currentSkillHash, evidenceResult }) => describeBlockedSkill({ skillId, base, currentSkillHash, evidenceResult }),
  });
  const blocked = skills.filter((skill) => skill.status !== 'verified');
  return {
    schemaVersion: 1,
    kind: 'aios.skill-training-gate.v1',
    status: blocked.length > 0 ? 'blocked' : 'verified',
    changedFiles: files,
    skills,
  };
}

// 显式点名 Skill 的解析：`--changed` 只能发现“相对 base 有差异”的 Skill，而已提交
// 的内容需要按 base=HEAD 重新出证（新鲜度契约见 scripts/tests/fixtures/
// skill-training-freshness.mjs）。没有这条路径时，发布前重认证只能靠手写脚本调用
// 库函数，不可复现。
export function resolveSkillSourcePaths({ rootDir = process.cwd(), skillIds = [] } = {}) {
  const files = [];
  const missing = [];
  for (const rawId of skillIds) {
    const skillId = String(rawId || '').trim().replace(/\\/gu, '/');
    if (!skillId || skillId.includes('..') || skillId.startsWith('/')) {
      if (skillId) missing.push(skillId);
      continue;
    }
    const paths = [
      path.posix.join('rex-harness', 'skill-sources', skillId, 'SKILL.md'),
      path.posix.join('skill-sources', skillId, 'SKILL.md'),
    ];
    const found = paths.find((rel) => existsSync(path.resolve(rootDir, rel)));
    if (found) files.push(found);
    else missing.push(skillId);
  }
  return { files: files.sort(), missing };
}

function unresolvedSkillReport(kind, missing) {
  return {
    schemaVersion: 1,
    kind,
    status: 'blocked',
    changedFiles: [],
    skills: missing.map((skillId) => ({
      skillId,
      status: 'blocked',
      reason: 'named Skill has no SKILL.md under skill-sources/ or rex-harness/skill-sources/',
    })),
  };
}

export async function runSkillTrainingGate(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const base = options.base || 'HEAD';
  const named = normalizeSkillOption(options.skill);
  if (named.length > 0) {
    const { files, missing } = resolveSkillSourcePaths({ rootDir, skillIds: named });
    if (missing.length > 0) {
      const blocked = unresolvedSkillReport('aios.skill-training-gate.v1', missing);
      writeReport(stdout, blocked, options, renderSkillTrainingGateText);
      return { exitCode: 1, report: blocked };
    }
    const report = await verifySkillTrainingGate({ rootDir, base, changedFiles: files });
    writeReport(stdout, report, options, renderSkillTrainingGateText);
    return { exitCode: report.status === 'verified' ? 0 : 1, report };
  }
  const report = await verifySkillTrainingGate({
    rootDir,
    base,
  });
  const json = options.json || options.format === 'json';
  if (json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else stdout.write(renderSkillTrainingGateText(report));
  return { exitCode: report.status === 'verified' ? 0 : 1, report };
}

export async function runSkillTrainingCertification(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const base = options.base || 'HEAD';
  const named = normalizeSkillOption(options.skill);
  if (named.length > 0) {
    const { files, missing } = resolveSkillSourcePaths({ rootDir, skillIds: named });
    if (missing.length > 0) {
      const blocked = unresolvedSkillReport('aios.skill-training-certification-report.v1', missing);
      writeReport(stdout, blocked, options, renderSkillTrainingCertificationText);
      return { exitCode: 1, report: blocked };
    }
    const report = await certifySkillTraining({ rootDir, changedFiles: files, base });
    writeReport(stdout, report, options, renderSkillTrainingCertificationText);
    return { exitCode: report.status === 'verified' ? 0 : 1, report };
  }
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

// --skill 支持重复传参与逗号分隔；不猜名字，解析不出来就是 blocked。
function normalizeSkillOption(value) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((entry) => String(entry || '').split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function writeReport(stdout, report, options, renderText) {
  if (options.json || options.format === 'json') stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else stdout.write(renderText(report));
}

function renderSkillTrainingGateText(report) {
  const lines = [`AIOS skill training gate: ${report.status}`];
  for (const skill of report.skills) {
    const detail = skill.status === 'verified'
      ? (skill.supersededBy ? ` (${skill.code}: verified through ${skill.supersededBy})` : '')
      : `${skill.reasonKind ? ` (${skill.reasonKind}: ${skill.reason})` : (skill.reason ? ` (${skill.reason})` : '')}${skill.remedy ? ` remedy: ${skill.remedy}` : ''}`;
    lines.push(`- ${skill.skillId}: ${skill.status}${detail}`);
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
