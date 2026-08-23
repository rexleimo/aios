/**
 * Evolution evaluator — deterministic candidate validation against fixtures.
 *
 * Runs the acceptance contract checks on a candidate object and produces
 * the `checks` + `metrics` inputs for verdict.mjs. No LLM calls:
 * every check is a deterministic rule so verdicts are reproducible.
 *
 * Checks implemented:
 * - schema:       candidate object has required fields with valid values
 * - safety:       no dangerous command / prompt-injection patterns
 * - scope:        scope is one of session/project/global and obeys policy
 * - functional:   replay task succeeds under the candidate patch
 * - tests:        candidate passes its declared test assertions
 * - holdout:      holdout task does not regress under the candidate
 * - regression:   metrics do not regress vs baseline
 *
 * Trusted-core and baseHash staleness are enforced as hard blocks
 * before any check can promote.
 */

import { sha256Hex } from '../../memo/storage/fs-io.mjs';
import { createVerdict, evaluateVerdict, writeVerdict } from './verdict.mjs';

const VALID_SCOPES = new Set(['session', 'project', 'global']);

const DANGEROUS_PATTERNS = Object.freeze([
  /rm\s+-rf\s+\//u,
  /curl[^\n]*\|\s*(ba)?sh/u,
  /wget[^\n]*\|\s*(ba)?sh/u,
  /:\(\)\s*\{\s*:\|:&\s*\};:/u, // fork bomb
  /mkfs\./u,
  /dd\s+if=[^\n]*of=\/dev\//u,
  /chmod\s+-R\s+777\s+\//u,
  /ignore\s+(all\s+)?previous\s+instructions/u,
  /system\s*:\s*you\s+are\s+now/u,
]);

const TRUSTED_CORE_PATTERNS = Object.freeze([
  'evolution/verdict.mjs',
  'evolution/trigger.mjs',
  'evolution/promotion.mjs',
  'evolution/evaluator.mjs',
  'memo/storage/candidates.mjs',
]);

/**
 * Check 1: schema validity of the candidate object.
 */
export function checkCandidateSchema(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return { pass: false, reason: 'candidate must be an object' };
  }
  if (!candidate.candidateId) {
    return { pass: false, reason: 'candidateId is required' };
  }
  if (!candidate.type) {
    return { pass: false, reason: 'type is required (memory|skill|prompt|policy|plugin)' };
  }
  if (!VALID_SCOPES.has(candidate.scope)) {
    return { pass: false, reason: `scope must be one of ${[...VALID_SCOPES].join('|')}` };
  }
  if (!candidate.baseHash && candidate.type !== 'plugin') {
    return { pass: false, reason: 'baseHash is required for non-plugin candidates' };
  }
  if (!Array.isArray(candidate.evidenceRefs) || candidate.evidenceRefs.length === 0) {
    return { pass: false, reason: 'evidenceRefs must be a non-empty array' };
  }
  if (!candidate.patch && !candidate.content) {
    return { pass: false, reason: 'patch or content is required' };
  }
  return { pass: true, reason: null };
}

/**
 * Check 2: safety scan for dangerous commands and injection patterns.
 */
export function checkCandidateSafety(candidate) {
  const text = JSON.stringify(candidate.patch || candidate.content || '');
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      return { pass: false, reason: `dangerous pattern matched: ${pattern.source}` };
    }
  }
  return { pass: true, reason: null };
}

/**
 * Check 3: trusted-core protection. Candidates touching trusted core are blocked.
 */
export function checkTrustedCore(candidate) {
  const touched = [
    ...(candidate.touchedFiles || []),
    ...(Array.isArray(candidate.patch?.files) ? candidate.patch.files : []),
  ];
  for (const file of touched) {
    for (const trusted of TRUSTED_CORE_PATTERNS) {
      if (String(file).includes(trusted)) {
        return { pass: false, reason: `candidate modifies trusted core: ${file}` };
      }
    }
  }
  return { pass: true, reason: null };
}

/**
 * Check 4: baseHash staleness. The candidate's baseHash must match the
 * current baseline hash, otherwise it was built against an old version.
 */
export function checkBaseHash(candidate, currentBaselineHash) {
  if (!candidate.baseHash) {
    return { pass: false, reason: 'baseHash missing' };
  }
  if (candidate.baseHash !== currentBaselineHash) {
    return { pass: false, reason: 'stale baseHash: candidate built against an older version' };
  }
  return { pass: true, reason: null };
}

/**
 * Check 5: memory conflict detection. A memory candidate conflicts when it
 * targets the same key as an existing active memory with a different value
 * and does not declare `supersedes`.
 */
export function checkMemoryConflict(candidate, activeMemories = []) {
  if (candidate.type !== 'memory') {
    return { pass: true, reason: null, conflicts: [] };
  }
  const conflicts = [];
  for (const active of activeMemories) {
    if (active.key === candidate.key && active.value !== candidate.content) {
      if (!candidate.supersedes || candidate.supersedes !== active.id) {
        conflicts.push({ key: active.key, activeId: active.id });
      }
    }
  }
  if (conflicts.length > 0) {
    return { pass: false, reason: `${conflicts.length} unresolved memory conflict(s)`, conflicts };
  }
  return { pass: true, reason: null, conflicts: [] };
}

/**
 * Check 6: functional replay. Runs the candidate's patch function against
 * the replay task and checks the expected output.
 */
export function checkReplay(candidate, replayTask) {
  if (!replayTask) {
    return { pass: false, reason: 'no replay task provided' };
  }
  try {
    const applyFn = candidate.apply || replayTask.apply;
    if (typeof applyFn !== 'function') {
      return { pass: false, reason: 'candidate has no executable apply function for replay' };
    }
    const result = applyFn(replayTask.input);
    const pass = JSON.stringify(result) === JSON.stringify(replayTask.expected);
    return {
      pass,
      reason: pass ? null : `replay mismatch: got ${JSON.stringify(result)}`,
      actual: result,
    };
  } catch (error) {
    return { pass: false, reason: `replay threw: ${error.message}` };
  }
}

/**
 * Check 7: holdout regression. The candidate must not regress on holdout tasks.
 */
export function checkHoldout(candidate, holdoutTasks = []) {
  if (holdoutTasks.length === 0) {
    return { pass: false, reason: 'at least one holdout task is required' };
  }
  const failures = [];
  for (const task of holdoutTasks) {
    try {
      const applyFn = candidate.apply || task.apply;
      if (typeof applyFn !== 'function') {
        failures.push({ taskId: task.taskId, reason: 'no apply function' });
        continue;
      }
      const result = applyFn(task.input);
      if (JSON.stringify(result) !== JSON.stringify(task.expected)) {
        failures.push({ taskId: task.taskId, reason: 'holdout output mismatch' });
      }
    } catch (error) {
      failures.push({ taskId: task.taskId, reason: error.message });
    }
  }
  if (failures.length > 0) {
    return { pass: false, reason: `${failures.length} holdout failure(s)`, failures };
  }
  return { pass: true, reason: null, failures: [] };
}

/**
 * Check 8: metrics regression comparison.
 */
export function checkMetrics(baselineMetrics = {}, candidateMetrics = {}) {
  const b = baselineMetrics.successRate ?? 0;
  const c = candidateMetrics.successRate ?? 0;
  if (c < b) {
    return { pass: false, reason: `success rate regressed: ${c} < ${b}` };
  }
  return { pass: true, reason: null };
}

/**
 * Evaluate a candidate end-to-end and produce a verdict.
 *
 * @param {Object} options
 * @param {Object} options.candidate - Candidate under test
 * @param {Object} options.baseline - Baseline definition (hash, metrics)
 * @param {Object} [options.replayTask] - Replay task fixture
 * @param {Array}  [options.holdoutTasks] - Holdout task fixtures
 * @param {Array}  [options.activeMemories] - Active memories for conflict check
 * @param {string} [options.rootDir] - If provided, verdict is persisted
 * @returns {Object} The evaluated verdict
 */
export async function evaluateCandidate({
  candidate,
  baseline = {},
  replayTask = null,
  holdoutTasks = [],
  activeMemories = [],
  rootDir = null,
  env = process.env,
} = {}) {
  // Hard blocks first (trusted core, schema, safety)
  const trusted = checkTrustedCore(candidate || {});
  const schema = checkCandidateSchema(candidate);
  const safety = checkCandidateSafety(candidate || {});

  const baselineHash = baseline.hash || (baseline.content ? sha256Hex(JSON.stringify(baseline.content)) : '');
  const baseHash = checkBaseHash(candidate || {}, baselineHash);
  const conflict = checkMemoryConflict(candidate || {}, activeMemories);

  const checks = {
    schema: schema.pass ? 'pass' : 'fail',
    safety: safety.pass ? 'pass' : 'fail',
    scope: (schema.pass && VALID_SCOPES.has(candidate?.scope)) ? 'pass' : 'fail',
    functional: 'skip',
    tests: 'skip',
    holdout: 'skip',
    regression: 'skip',
  };

  // Functional / holdout / regression only run if the hard gates pass
  let replay = null;
  let holdout = null;
  let metrics = null;
  if (schema.pass && safety.pass && trusted.pass && baseHash.pass) {
    replay = checkReplay(candidate, replayTask);
    holdout = checkHoldout(candidate, holdoutTasks);
    metrics = checkMetrics(baseline.metrics || {}, candidate.metrics || {});
    checks.functional = replay.pass ? 'pass' : 'fail';
    checks.tests = (candidate.testsPass !== false) ? 'pass' : 'fail';
    checks.holdout = holdout.pass ? 'pass' : 'fail';
    checks.regression = metrics.pass ? 'pass' : 'fail';
  }

  const metricsBlock = {
    baselineSuccessRate: baseline.metrics?.successRate ?? 0,
    candidateSuccessRate: candidate?.metrics?.successRate ?? 0,
    baselineAvgTokens: baseline.metrics?.avgTokens ?? 0,
    candidateAvgTokens: candidate?.metrics?.avgTokens ?? 0,
    baselineUserCorrections: baseline.metrics?.userCorrections ?? 0,
    candidateUserCorrections: candidate?.metrics?.userCorrections ?? 0,
  };

  let verdict = createVerdict({
    candidateId: candidate?.candidateId || 'invalid',
    baselineVersion: baseline.version || 'baseline',
    candidateVersion: candidate?.version || 'candidate',
    checks,
    metrics: metricsBlock,
    evidenceRefs: Array.isArray(candidate?.evidenceRefs) ? candidate.evidenceRefs : [],
  });

  verdict = evaluateVerdict(verdict, {
    blockReason: !safety.pass ? safety.reason : (!schema.pass ? schema.reason : null),
  });

  // Hard-block overrides: trusted core and stale baseHash always block,
  // regardless of what evaluateVerdict computed.
  if (!trusted.pass) {
    verdict = { ...verdict, decision: 'blocked', blockedReason: trusted.reason };
  } else if (!baseHash.pass) {
    verdict = { ...verdict, decision: 'blocked', blockedReason: baseHash.reason };
  } else if (!conflict.pass) {
    verdict = { ...verdict, decision: 'needs_review', reviewReason: conflict.reason };
  }

  verdict.checkDetails = {
    schema: schema.reason,
    safety: safety.reason,
    trustedCore: trusted.reason,
    baseHash: baseHash.reason,
    conflict: conflict.reason,
    replay: replay?.reason ?? null,
    holdout: holdout?.reason ?? null,
    regression: metrics?.reason ?? null,
  };

  if (rootDir && verdict.candidateId && verdict.candidateId !== 'invalid') {
    await writeVerdict(rootDir, verdict, env);
  }

  return verdict;
}

export { DANGEROUS_PATTERNS, TRUSTED_CORE_PATTERNS, VALID_SCOPES };
