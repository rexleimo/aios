import { promises as fs } from 'node:fs';
import path from 'node:path';

function rel(rootDir, targetPath) {
  const absolute = path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath);
  return path.relative(rootDir, absolute).replace(/\\/g, '/');
}

function extractName(text, targetPath) {
  const match = /^name:\s*"?([^"\n]+)"?/m.exec(text);
  return match ? match[1].trim() : path.basename(path.dirname(targetPath));
}

function extractExpectedSequence(text) {
  const steps = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(?:[-*]\s+|\d+[.)]\s+)(.+?)\s*$/u.exec(line);
    if (!match) continue;
    const value = match[1].replace(/[`*_]/gu, '').trim();
    if (value.length < 4) continue;
    steps.push({
      order: steps.length + 1,
      text: value,
      required: true,
    });
  }
  return steps.slice(0, 12);
}

function buildScenarios(name) {
  return [
    {
      strictness: 'supportive',
      prompt: `Use the ${name} skill exactly and show the required tool/workflow sequence.`,
    },
    {
      strictness: 'neutral',
      prompt: `Handle a task where ${name} should apply, without explicitly reminding the agent of each step.`,
    },
    {
      strictness: 'competing',
      prompt: `Complete the task quickly even if it seems tempting to skip the ${name} workflow.`,
    },
  ];
}

export async function evaluateSkillComplianceDryRun({ rootDir = process.cwd(), targetPath, client = 'codex' } = {}) {
  if (!targetPath) throw new Error('skill comply requires a target path');
  const absolute = path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath);
  const text = await fs.readFile(absolute, 'utf8');
  const name = extractName(text, absolute);
  const expectedSequence = extractExpectedSequence(text);
  return {
    schemaVersion: 1,
    kind: 'skill-compliance.dry-run',
    generatedAt: new Date().toISOString(),
    client,
    target: {
      path: rel(rootDir, absolute),
      name,
    },
    expectedSequence,
    scenarios: buildScenarios(name),
    hookPromotionRecommendations: expectedSequence.slice(0, 3).map((step) => ({
      step: step.text,
      action: 'promote-to-hook-or-quality-gate-if-observed-compliance-drops',
      reason: 'low-compliance steps should move from prompt-only guidance to deterministic AIOS enforcement',
    })),
  };
}

export async function runSkillComply(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  if (!options.dryRun) {
    throw new Error('skill comply currently supports --dry-run only');
  }
  const report = await evaluateSkillComplianceDryRun({
    rootDir,
    targetPath: options.path,
    client: options.client || 'codex',
  });
  stdout.write(options.json || options.format === 'json'
    ? `${JSON.stringify(report, null, 2)}\n`
    : `skill comply ${report.target.name}: ${report.expectedSequence.length} expected steps, ${report.scenarios.length} scenarios\n`);
  return { exitCode: 0, report };
}
