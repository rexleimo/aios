/**
 * P10 — skill comply --live (deterministic local runner, no external LLM required).
 * Scores whether skill document structure + keywords support the expected sequence
 * under supportive / neutral / competing scenario prompts.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { evaluateSkillComplianceDryRun } from './compliance.mjs';

function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/giu, ' ')
    .split(/\s+/u)
    .filter((t) => t.length >= 3);
}

function scoreStepAgainstBody(stepText, bodyTokens, bodyLower) {
  const stepTokens = tokenize(stepText);
  if (stepTokens.length === 0) return { hit: false, score: 0 };
  let hits = 0;
  for (const token of stepTokens.slice(0, 8)) {
    if (bodyTokens.has(token) || bodyLower.includes(token)) hits += 1;
  }
  const score = hits / Math.min(8, stepTokens.length);
  return { hit: score >= 0.34, score };
}

/**
 * Live evaluation: deterministic structural + lexical compliance probe.
 */
export async function evaluateSkillComplianceLive({
  rootDir = process.cwd(),
  targetPath,
  client = 'codex',
} = {}) {
  const dry = await evaluateSkillComplianceDryRun({ rootDir, targetPath, client });
  const absolute = path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath);
  const body = await fs.readFile(absolute, 'utf8');
  const bodyLower = body.toLowerCase();
  const bodyTokens = new Set(tokenize(body));

  const hasFrontmatter = /^---\n[\s\S]*?\n---/m.test(body);
  const hasName = /^name:\s*\S+/m.test(body) || /name:\s*["']?\S+/.test(body);
  const hasDescription = /description:\s*\S+/i.test(body);
  const sequence = dry.expectedSequence || [];

  const stepScores = sequence.map((step) => {
    const result = scoreStepAgainstBody(step.text, bodyTokens, bodyLower);
    return {
      order: step.order,
      text: step.text,
      required: step.required,
      ...result,
    };
  });

  const covered = stepScores.filter((s) => s.hit).length;
  const coverage = sequence.length ? covered / sequence.length : 0;

  // Scenario probes: competing is harder (requires stronger coverage)
  const scenarioResults = (dry.scenarios || []).map((scenario) => {
    const threshold = scenario.strictness === 'competing'
      ? 0.5
      : scenario.strictness === 'neutral'
        ? 0.34
        : 0.25;
    const pass = hasFrontmatter && hasName && coverage >= threshold && sequence.length > 0;
    return {
      ...scenario,
      threshold,
      coverage,
      pass,
      reason: pass
        ? 'structure+lexical coverage meets threshold'
        : sequence.length === 0
          ? 'no expected sequence extracted from skill body'
          : `coverage ${coverage.toFixed(2)} < threshold ${threshold}`,
    };
  });

  const passed = scenarioResults.filter((s) => s.pass).length;
  const ok = passed === scenarioResults.length && sequence.length > 0 && hasFrontmatter;

  return {
    schemaVersion: 1,
    kind: 'skill-compliance.live',
    generatedAt: new Date().toISOString(),
    client,
    target: dry.target,
    dryRun: dry,
    live: {
      hasFrontmatter,
      hasName,
      hasDescription,
      sequenceLength: sequence.length,
      coverage,
      stepScores,
      scenarioResults,
      passedScenarios: passed,
      totalScenarios: scenarioResults.length,
    },
    ok,
    verdict: ok ? 'pass' : 'fail',
    hookPromotionRecommendations: dry.hookPromotionRecommendations,
  };
}
