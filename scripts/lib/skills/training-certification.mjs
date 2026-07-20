import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { evaluateSkillComplianceLive } from './compliance-live.mjs';
import { validateTrainingEvidence } from './training-evidence-validator.mjs';

const ARTIFACT_NAMES = Object.freeze({
  tasks: 'tasks.json',
  baselineSkill: 'baseline-skill.md',
  baselineRaw: 'baseline.raw.json',
  baselineScored: 'baseline.scored.json',
  candidateRaw: 'candidate.raw.json',
  candidateScored: 'candidate.scored.json',
});

const TASKS = Object.freeze([
  Object.freeze({ id: 'structure', split: 'train', assertions: Object.freeze(['frontmatter', 'name', 'description']) }),
  Object.freeze({ id: 'safety', split: 'train', assertions: Object.freeze(['no-critical-violations']) }),
  Object.freeze({ id: 'workflow', split: 'validation', assertions: Object.freeze(['all-scenarios-pass']) }),
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedPath(value) {
  return String(value || '').replace(/\\/gu, '/');
}

function isSafeRelativePath(value) {
  const normalized = normalizedPath(value);
  return normalized.length > 0
    && !normalized.startsWith('/')
    && !normalized.split('/').includes('..');
}

function readGit(rootDir, args) {
  const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

function isNestedRexWorktree(rootDir) {
  const rexRoot = path.join(rootDir, 'rex-harness');
  return readGit(rexRoot, ['rev-parse', '--show-prefix'])?.trim() === '';
}

function gitRevisionExists(rootDir, revision) {
  return readGit(rootDir, ['cat-file', '-e', `${revision}^{commit}`]) !== null;
}

function nestedRevisionAtBase(rootDir, base) {
  const output = readGit(rootDir, ['ls-tree', base, '--', 'rex-harness']);
  const match = String(output || '').match(/^160000 commit ([0-9a-f]{40}|[0-9a-f]{64})\trex-harness$/mu);
  return match ? match[1] : null;
}

function noSkillControl(skillId) {
  const name = `no-skill-control-${skillId.replace(/[^A-Za-z0-9-]/gu, '-') || 'candidate'}`;
  return `---\nname: ${name}\ndescription: A no-Skill control with no workflow guidance.\n---\n# No Skill Control\n`;
}

function readBaselineSkill({ rootDir, sourcePath, skillId, base }) {
  const normalized = normalizedPath(sourcePath);
  if (!isSafeRelativePath(normalized)) return null;
  if (normalized.startsWith('rex-harness/') && isNestedRexWorktree(rootDir)) {
    const rexRoot = path.join(rootDir, 'rex-harness');
    const revision = nestedRevisionAtBase(rootDir, base);
    if (!revision || !gitRevisionExists(rexRoot, revision)) return null;
    const content = readGit(rexRoot, ['show', `${revision}:${normalized.slice('rex-harness/'.length)}`]);
    return content === null
      ? { content: noSkillControl(skillId), kind: 'no-skill-control' }
      : { content, kind: 'git' };
  }
  if (!gitRevisionExists(rootDir, base)) return null;
  const content = readGit(rootDir, ['show', `${base}:${normalized}`]);
  return content === null
    ? { content: noSkillControl(skillId), kind: 'no-skill-control' }
    : { content, kind: 'git' };
}

function runId(skillId, now) {
  const stamp = now.toISOString().replace(/[:.]/gu, '-');
  return `${skillId.replace(/[^A-Za-z0-9._-]/gu, '-')}-certification-${stamp}`;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    throw error;
  }
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function rawResponse(report) {
  // The compliance probe records wall-clock time for operator diagnostics. It
  // is not behavioral evidence, so omit it before comparing a fresh run.
  const { generatedAt, ...stable } = report;
  const { generatedAt: dryRunGeneratedAt, ...stableDryRun } = stable.dryRun || {};
  return JSON.stringify({ ...stable, dryRun: stableDryRun });
}

function scoredRun({ runId: evidenceRunId, response }) {
  const quotes = {
    frontmatter: '"hasFrontmatter":true',
    name: '"hasName":true',
    description: '"hasDescription":true',
    'no-critical-violations': '"criticalViolations":[]',
    'all-scenarios-pass': '"verdict":"pass"',
  };
  const results = TASKS.map((task) => {
    const assertions = task.assertions.map((name) => {
      const evidenceQuote = quotes[name];
      const passed = response.includes(evidenceQuote);
      return {
        name,
        passed,
        evidenceQuote: passed ? evidenceQuote : '',
        rationale: passed
          ? 'The deterministic compliance probe emitted the required observable result.'
          : 'The deterministic compliance probe did not emit the required observable result.',
      };
    });
    const passedCount = assertions.filter((assertion) => assertion.passed).length;
    return {
      id: task.id,
      split: task.split,
      assertions,
      hard: passedCount === assertions.length ? 1 : 0,
      soft: passedCount / assertions.length,
    };
  });
  const hardFor = (split) => results.filter((result) => result.split === split).map((result) => result.hard);
  const average = (values) => values.reduce((total, value) => total + value, 0) / values.length;
  const train = hardFor('train');
  const validation = hardFor('validation');
  const all = results.map((result) => result.hard);
  return {
    runId: evidenceRunId,
    results,
    summary: {
      trainHard: average(train),
      validationHard: average(validation),
      overallHard: average(all),
    },
  };
}

function rawRun({ runId: evidenceRunId, response }) {
  return {
    runId: evidenceRunId,
    results: TASKS.map((task) => ({ id: task.id, targetResponse: response })),
  };
}

async function evaluateSkill({ rootDir, targetPath, evidenceRunId }) {
  const report = await evaluateSkillComplianceLive({ rootDir, targetPath, client: 'certification' });
  const response = rawResponse(report);
  return {
    report,
    raw: rawRun({ runId: evidenceRunId, response }),
    scored: scoredRun({ runId: evidenceRunId, response }),
  };
}

function evidenceDirectory(rootDir, statePath) {
  return path.dirname(statePath);
}

function artifactPath(rootDir, statePath, relativePath) {
  if (typeof relativePath !== 'string' || !isSafeRelativePath(relativePath)) return null;
  const base = evidenceDirectory(rootDir, statePath);
  const target = path.resolve(base, relativePath);
  return target.startsWith(`${base}${path.sep}`) ? target : null;
}

function allHardPass(metrics) {
  return metrics.trainHard === 1 && metrics.validationHard === 1 && metrics.overallHard === 1;
}

export async function certifySkillTraining({
  rootDir = process.cwd(),
  changedFiles = [],
  base = 'HEAD',
  now = new Date(),
} = {}) {
  const skills = [];
  for (const sourcePath of [...new Set(changedFiles.map(normalizedPath))].sort()) {
    const match = sourcePath.match(/(?:^|\/)skill-sources\/(.+)\/SKILL\.md$/u);
    if (!match || !isSafeRelativePath(sourcePath)) continue;
    const skillId = match[1];
    const candidatePath = path.resolve(rootDir, sourcePath);
    let candidateContent;
    try {
      candidateContent = await fs.readFile(candidatePath, 'utf8');
    } catch (error) {
      skills.push({ skillId, sourcePath, status: 'blocked', reason: `unable to read current Skill: ${error.message}` });
      continue;
    }
    const baseline = readBaselineSkill({ rootDir, sourcePath, skillId, base });
    if (baseline === null) {
      skills.push({ skillId, sourcePath, status: 'blocked', reason: `unable to read Git baseline ${base}:${sourcePath}` });
      continue;
    }
    const baselineContent = baseline.content;

    // Release gates must be able to recompute this evidence in a clean CI
    // checkout, so certificates live in a tracked, reviewable directory.
    const dirPath = path.join(rootDir, 'docs', 'evidence', 'skill-training', runId(skillId, now));
    await fs.mkdir(dirPath, { recursive: true });
    const baselinePath = path.join(dirPath, ARTIFACT_NAMES.baselineSkill);
    await fs.writeFile(baselinePath, baselineContent, 'utf8');
    const baselineRunId = `${skillId}-baseline`;
    const candidateRunId = `${skillId}-candidate`;
    const baselineEvaluation = await evaluateSkill({ rootDir, targetPath: baselinePath, evidenceRunId: baselineRunId });
    const candidate = await evaluateSkill({ rootDir, targetPath: candidatePath, evidenceRunId: candidateRunId });
    const baselineValidation = validateTrainingEvidence({ tasks: TASKS, raw: baselineEvaluation.raw, scored: baselineEvaluation.scored });
    const candidateValidation = validateTrainingEvidence({ tasks: TASKS, raw: candidate.raw, scored: candidate.scored });
    const nonRegression = baselineValidation.valid
      && candidateValidation.valid
      && candidateValidation.metrics.validationHard >= baselineValidation.metrics.validationHard;
    const accepted = nonRegression && allHardPass(candidateValidation.metrics);

    await writeJson(path.join(dirPath, ARTIFACT_NAMES.tasks), TASKS);
    await writeJson(path.join(dirPath, ARTIFACT_NAMES.baselineRaw), baselineEvaluation.raw);
    await writeJson(path.join(dirPath, ARTIFACT_NAMES.baselineScored), baselineEvaluation.scored);
    await writeJson(path.join(dirPath, ARTIFACT_NAMES.candidateRaw), candidate.raw);
    await writeJson(path.join(dirPath, ARTIFACT_NAMES.candidateScored), candidate.scored);
    const statePath = path.join(dirPath, 'state.json');
    await writeJson(statePath, {
      schemaVersion: 2,
      kind: 'aios.skill-training-certification.v2',
      skillId,
      sourcePath,
      base,
      status: accepted ? 'accepted' : 'rejected',
      nonRegression,
      acceptedSkillHash: sha256(candidateContent),
      baseline: { kind: baseline.kind, contentSha256: sha256(baselineContent) },
      candidate: { contentSha256: sha256(candidateContent) },
      metrics: { baseline: baselineValidation.metrics, candidate: candidateValidation.metrics },
      artifacts: ARTIFACT_NAMES,
      generatedAt: now.toISOString(),
    });
    skills.push({
      skillId,
      sourcePath,
      status: accepted ? 'accepted' : 'blocked',
      statePath,
      reason: accepted ? '' : 'candidate did not pass deterministic scenarios without regression',
    });
  }
  return {
    schemaVersion: 1,
    kind: 'aios.skill-training-certification-report.v1',
    // A no-change certification is a successful no-op. The verification gate
    // remains responsible for deciding which Skills a release must cover.
    status: skills.every((skill) => skill.status === 'accepted') ? 'verified' : 'blocked',
    skills,
  };
}

export async function validateCertifiedTrainingEvidence({
  rootDir = process.cwd(),
  statePath,
  state,
  skillId,
  sourcePath,
  currentSkillHash,
  base = 'HEAD',
} = {}) {
  if (state?.schemaVersion !== 2 || state?.kind !== 'aios.skill-training-certification.v2') {
    return { ok: false, reason: 'accepted state has no auditable training artifacts' };
  }
  if (state.skillId !== skillId || state.sourcePath !== sourcePath || state.acceptedSkillHash !== currentSkillHash) {
    return { ok: false, reason: 'certification state does not match the current Skill identity or hash' };
  }
  if (state.status !== 'accepted' || state.nonRegression !== true) {
    return { ok: false, reason: 'certification state is not an accepted non-regression result' };
  }
  const artifacts = state.artifacts || {};
  const required = Object.keys(ARTIFACT_NAMES);
  const artifactPaths = Object.fromEntries(required.map((key) => [key, artifactPath(rootDir, statePath, artifacts[key])]));
  if (Object.values(artifactPaths).some((value) => !value)) {
    return { ok: false, reason: 'certification state references an unsafe or missing artifact path' };
  }
  const [tasks, baselineContent, baselineRaw, baselineScored, candidateRaw, candidateScored] = await Promise.all([
    readJson(artifactPaths.tasks),
    fs.readFile(artifactPaths.baselineSkill, 'utf8').catch(() => null),
    readJson(artifactPaths.baselineRaw),
    readJson(artifactPaths.baselineScored),
    readJson(artifactPaths.candidateRaw),
    readJson(artifactPaths.candidateScored),
  ]);
  if (!Array.isArray(tasks) || typeof baselineContent !== 'string' || !baselineRaw || !baselineScored || !candidateRaw || !candidateScored) {
    return { ok: false, reason: 'certification artifacts are incomplete or unreadable' };
  }
  const expectedBaseline = readBaselineSkill({ rootDir, sourcePath, skillId, base });
  if (expectedBaseline === null
    || expectedBaseline.kind !== state.baseline?.kind
    || sha256(baselineContent) !== sha256(expectedBaseline.content)
    || state.baseline?.contentSha256 !== sha256(baselineContent)) {
    return { ok: false, reason: 'stored baseline does not match the Git baseline for this release check' };
  }
  const [baseline, candidate] = await Promise.all([
    evaluateSkill({ rootDir, targetPath: artifactPaths.baselineSkill, evidenceRunId: `${skillId}-baseline` }),
    evaluateSkill({ rootDir, targetPath: path.resolve(rootDir, sourcePath), evidenceRunId: `${skillId}-candidate` }),
  ]);
  if (JSON.stringify(baseline.raw) !== JSON.stringify(baselineRaw)) {
    return { ok: false, reason: 'recorded baseline raw output does not match a fresh deterministic scenario run' };
  }
  if (JSON.stringify(candidate.raw) !== JSON.stringify(candidateRaw)) {
    return { ok: false, reason: 'recorded candidate raw output does not match a fresh deterministic scenario run' };
  }
  const baselineValidation = validateTrainingEvidence({ tasks, raw: baselineRaw, scored: baselineScored });
  const candidateValidation = validateTrainingEvidence({ tasks, raw: candidateRaw, scored: candidateScored });
  const nonRegression = baselineValidation.valid
    && candidateValidation.valid
    && candidateValidation.metrics.validationHard >= baselineValidation.metrics.validationHard;
  if (!nonRegression || !allHardPass(candidateValidation.metrics)) {
    return { ok: false, reason: 'certification scenarios regress or do not all pass' };
  }
  return { ok: true, score: candidateValidation.metrics.overallHard };
}
