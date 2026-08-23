/**
 * Evolution verdict — structured acceptance contract for candidates.
 *
 * Each candidate validation produces a deterministic JSON verdict with:
 * - Hard checks (schema, safety, scope, functional, tests, holdout, regression)
 * - Metrics (success rate, tokens, latency, user corrections)
 * - Decision (promote, canary, reject, needs_review, blocked)
 *
 * Verdicts are immutable once written and serve as evidence for promotion decisions.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveMemoRoot } from '../../aios/state-root.mjs';
import { atomicWriteText, sha256Hex } from '../../memo/storage/fs-io.mjs';

const VERDICTS_DIR = 'verdicts';

const HARD_CHECKS = Object.freeze([
  'schema',
  'safety',
  'scope',
  'functional',
  'tests',
  'holdout',
  'regression',
]);

const VERDICT_CHECK_VALUES = new Set(['pass', 'fail', 'neutral', 'skip']);

const DECISION_VALUES = new Set([
  'promote',
  'canary',
  'reject',
  'needs_review',
  'blocked',
]);

function verdictsRoot(rootDir, env = process.env) {
  return path.join(resolveMemoRoot(rootDir, { env }), 'evolution', VERDICTS_DIR);
}

/**
 * Validate that a verdict object conforms to the schema.
 */
export function validateVerdictSchema(verdict) {
  if (!verdict || typeof verdict !== 'object') {
    return { valid: false, error: 'verdict must be an object' };
  }

  if (verdict.schemaVersion !== 1) {
    return { valid: false, error: 'schemaVersion must be 1' };
  }

  if (!verdict.candidateId || typeof verdict.candidateId !== 'string') {
    return { valid: false, error: 'candidateId is required' };
  }

  if (!verdict.baselineVersion || typeof verdict.baselineVersion !== 'string') {
    return { valid: false, error: 'baselineVersion is required' };
  }

  if (!verdict.candidateVersion || typeof verdict.candidateVersion !== 'string') {
    return { valid: false, error: 'candidateVersion is required' };
  }

  if (!verdict.checks || typeof verdict.checks !== 'object') {
    return { valid: false, error: 'checks is required' };
  }

  for (const check of HARD_CHECKS) {
    if (!VERDICT_CHECK_VALUES.has(verdict.checks[check])) {
      return { valid: false, error: `checks.${check} must be one of: ${[...VERDICT_CHECK_VALUES].join(', ')}` };
    }
  }

  if (!verdict.metrics || typeof verdict.metrics !== 'object') {
    return { valid: false, error: 'metrics is required' };
  }

  if (!DECISION_VALUES.has(verdict.decision)) {
    return { valid: false, error: `decision must be one of: ${[...DECISION_VALUES].join(', ')}` };
  }

  if (!Array.isArray(verdict.evidenceRefs)) {
    return { valid: false, error: 'evidenceRefs must be an array' };
  }

  if (!verdict.createdAt || typeof verdict.createdAt !== 'string') {
    return { valid: false, error: 'createdAt is required' };
  }

  return { valid: true, error: null };
}

/**
 * Evaluate hard checks and determine the verdict decision.
 *
 * Rules:
 * - Any hard check fail -> reject
 * - Safety or scope fail -> blocked
 * - All hard checks pass + low risk -> promote or canary
 * - Mixed metrics -> needs_review
 *
 * Optional blockReason overrides the generic safety/scope block message
 * so the verdict carries the specific finding from the evaluator.
 * The verdictHash is recomputed here over the final decision so that
 * identical inputs always produce identical hashes.
 */
export function evaluateVerdict(verdict, { blockReason = null } = {}) {
  const schemaCheck = validateVerdictSchema(verdict);
  if (!schemaCheck.valid) {
    const blocked = { ...verdict, decision: 'blocked', blockedReason: `Schema invalid: ${schemaCheck.error}` };
    return withDecisionHash(blocked);
  }

  // Check for blocked conditions
  if (verdict.checks.safety === 'fail') {
    const blocked = { ...verdict, decision: 'blocked', blockedReason: blockReason || 'Safety check failed' };
    return withDecisionHash(blocked);
  }

  if (verdict.checks.scope === 'fail') {
    const blocked = { ...verdict, decision: 'blocked', blockedReason: blockReason || 'Scope violation' };
    return withDecisionHash(blocked);
  }

  // Check for rejection
  const hardFails = HARD_CHECKS.filter((check) => verdict.checks[check] === 'fail');
  if (hardFails.length > 0) {
    return withDecisionHash({ ...verdict, decision: 'reject', rejectReason: `Hard checks failed: ${hardFails.join(', ')}` });
  }

  // Evaluate metrics
  const metrics = verdict.metrics || {};
  const baselineSuccess = metrics.baselineSuccessRate || 0;
  const candidateSuccess = metrics.candidateSuccessRate || 0;

  // Regression: candidate worse than baseline
  if (candidateSuccess < baselineSuccess) {
    return withDecisionHash({ ...verdict, decision: 'reject', rejectReason: 'Candidate success rate lower than baseline' });
  }

  // Improvement: candidate better than baseline
  if (candidateSuccess > baselineSuccess) {
    // Low risk: promote directly (or canary for project/global scope)
    return withDecisionHash({ ...verdict, decision: 'canary' });
  }

  // Neutral: same success rate, check other metrics
  const baselineTokens = metrics.baselineAvgTokens || 0;
  const candidateTokens = metrics.candidateAvgTokens || 0;
  const baselineCorrections = metrics.baselineUserCorrections || 0;
  const candidateCorrections = metrics.candidateUserCorrections || 0;

  // Token efficiency improvement
  if (candidateTokens < baselineTokens * 0.9) {
    return withDecisionHash({ ...verdict, decision: 'canary' });
  }

  // Fewer user corrections
  if (candidateCorrections < baselineCorrections) {
    return withDecisionHash({ ...verdict, decision: 'canary' });
  }

  // No clear improvement
  return withDecisionHash({ ...verdict, decision: 'needs_review', reviewReason: 'No clear improvement over baseline' });
}

/**
 * Recompute the verdictHash over the final decision-relevant fields.
 * Called after the decision is fixed so identical inputs always yield
 * identical hashes (reproducible acceptance decisions).
 */
function withDecisionHash(verdict) {
  const hashInput = {
    schemaVersion: verdict.schemaVersion,
    candidateId: verdict.candidateId,
    baselineVersion: verdict.baselineVersion,
    candidateVersion: verdict.candidateVersion,
    checks: verdict.checks,
    metrics: verdict.metrics,
    decision: verdict.decision,
    evidenceRefs: verdict.evidenceRefs,
  };
  return { ...verdict, verdictHash: sha256Hex(JSON.stringify(hashInput)) };
}

/**
 * Create a new verdict object.
 */
export function createVerdict({
  candidateId,
  baselineVersion,
  candidateVersion,
  checks = {},
  metrics = {},
  evidenceRefs = [],
} = {}) {
  const verdict = {
    schemaVersion: 1,
    candidateId,
    baselineVersion,
    candidateVersion,
    checks: {
      schema: checks.schema || 'skip',
      safety: checks.safety || 'skip',
      scope: checks.scope || 'skip',
      functional: checks.functional || 'skip',
      tests: checks.tests || 'skip',
      holdout: checks.holdout || 'skip',
      regression: checks.regression || 'skip',
      ...(checks.cost ? { cost: checks.cost } : {}),
    },
    metrics,
    decision: 'needs_review',
    evidenceRefs,
    createdAt: new Date().toISOString(),
    verdictHash: '',
  };

  // Compute verdict hash over the decision-relevant fields only.
  // createdAt is excluded so identical evaluations produce identical hashes
  // (acceptance decisions must be reproducible, not clock-dependent).
  const hashInput = {
    schemaVersion: verdict.schemaVersion,
    candidateId: verdict.candidateId,
    baselineVersion: verdict.baselineVersion,
    candidateVersion: verdict.candidateVersion,
    checks: verdict.checks,
    metrics: verdict.metrics,
    decision: verdict.decision,
    evidenceRefs: verdict.evidenceRefs,
  };
  verdict.verdictHash = sha256Hex(JSON.stringify(hashInput));

  return verdict;
}

/**
 * Persist a verdict to disk.
 */
export async function writeVerdict(rootDir, verdict, env = process.env) {
  const schemaCheck = validateVerdictSchema(verdict);
  if (!schemaCheck.valid) {
    throw new Error(`Invalid verdict: ${schemaCheck.error}`);
  }

  const evaluated = evaluateVerdict(verdict);
  const target = path.join(verdictsRoot(rootDir, env), `${evaluated.candidateId}.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await atomicWriteText(target, `${JSON.stringify(evaluated, null, 2)}\n`);
  return evaluated;
}

/**
 * Read a verdict from disk.
 */
export async function readVerdict(rootDir, candidateId, env = process.env) {
  const target = path.join(verdictsRoot(rootDir, env), `${candidateId}.json`);
  try {
    const raw = await fs.readFile(target, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * List all verdicts in the workspace.
 */
export async function listVerdicts(rootDir, env = process.env) {
  const dir = verdictsRoot(rootDir, env);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const verdicts = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const raw = await fs.readFile(path.join(dir, entry.name), 'utf8');
        verdicts.push(JSON.parse(raw));
      }
    }
    return verdicts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export { HARD_CHECKS, DECISION_VALUES, VERDICT_CHECK_VALUES };
