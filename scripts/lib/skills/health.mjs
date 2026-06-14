import { promises as fs } from 'node:fs';
import path from 'node:path';

function healthDir(rootDir) {
  return path.join(rootDir, '.aios', 'skill-health');
}

function observationsPath(rootDir) {
  return path.join(healthDir(rootDir), 'observations.jsonl');
}

function normalizeStatus(status) {
  return status === 'success' ? 'success' : 'failure';
}

export async function recordSkillObservation({
  rootDir = process.cwd(),
  skillId,
  status,
  failure = '',
  amendmentId = '',
  at = new Date().toISOString(),
} = {}) {
  if (!skillId) throw new Error('skill observation requires skillId');
  const row = {
    schemaVersion: 1,
    skillId,
    status: normalizeStatus(status),
    failure: String(failure || '').trim(),
    amendmentId: String(amendmentId || '').trim(),
    at,
  };
  await fs.mkdir(healthDir(rootDir), { recursive: true });
  await fs.appendFile(observationsPath(rootDir), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

async function readObservations(rootDir) {
  try {
    const raw = await fs.readFile(observationsPath(rootDir), 'utf8');
    return raw.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function buildSkillHealthReport({ rootDir = process.cwd(), now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const observations = (await readObservations(rootDir)).filter((row) => new Date(row.at) >= cutoff);
  const skills = {};
  const failures = new Map();
  for (const row of observations) {
    const bucket = skills[row.skillId] || {
      total: 0,
      success: 0,
      failure: 0,
      successRate: 0,
      pendingAmendments: [],
    };
    bucket.total += 1;
    bucket[row.status] += 1;
    if (row.amendmentId) bucket.pendingAmendments.push(row.amendmentId);
    skills[row.skillId] = bucket;
    if (row.status === 'failure' && row.failure) {
      failures.set(row.failure, (failures.get(row.failure) || 0) + 1);
    }
  }
  for (const bucket of Object.values(skills)) {
    bucket.successRate = bucket.total ? bucket.success / bucket.total : 0;
  }
  const failurePatterns = [...failures.entries()]
    .map(([failure, count]) => ({ failure, count }))
    .sort((a, b) => b.count - a.count);
  return {
    schemaVersion: 1,
    kind: 'skill-health.report',
    generatedAt: now.toISOString(),
    windowDays: 30,
    skills,
    failurePatterns,
  };
}

export async function runSkillHealth(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const report = await buildSkillHealthReport({ rootDir });
  if (options.json || options.format === 'json') {
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines = ['AIOS skill health (30d)'];
    for (const [skillId, skill] of Object.entries(report.skills)) {
      lines.push(`- ${skillId}: successRate=${skill.successRate.toFixed(2)} total=${skill.total} pending=${skill.pendingAmendments.length}`);
    }
    if (report.failurePatterns.length > 0) {
      lines.push(`failures: ${report.failurePatterns.map((item) => `${item.failure}(${item.count})`).join(', ')}`);
    }
    stdout.write(`${lines.join('\n')}\n`);
  }
  return { exitCode: 0, report };
}
