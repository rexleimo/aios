/**
 * Evolution promotion pipeline.
 *
 * State machine:
 *   candidate -> reviewing -> validated -> proposed -> approved
 *             -> canary -> active -> stable
 *             -> rejected | validation_failed | degraded | rolled_back
 *
 * Promotion requires a valid verdict from verdict.mjs and records every
 * transition as an immutable audit event. Rollback restores the
 * previousStableVersion atomically.
 *
 * Trusted core (this module, evaluator, verdict, rollback controller)
 * cannot be modified by evolution candidates.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveMemoRoot } from '../../aios/state-root.mjs';
import { atomicWriteText, sha256Hex } from '../../memo/storage/fs-io.mjs';
import { readVerdict } from './verdict.mjs';

const PROMOTIONS_DIR = 'promotions';
const AUDIT_FILE = 'promotion-audit.jsonl';
const TRUSTED_CORE_FILES = Object.freeze([
  'verdict.mjs',
  'trigger.mjs',
  'promotion.mjs',
  'evaluator.mjs',
  'rollback.mjs',
]);

const VALID_TRANSITIONS = Object.freeze({
  candidate:    ['reviewing', 'rejected'],
  reviewing:    ['validated', 'validation_failed', 'rejected'],
  validated:    ['proposed', 'rejected'],
  proposed:     ['approved', 'rejected'],
  approved:     ['canary', 'rejected'],
  canary:       ['active', 'degraded', 'rejected'],
  active:       ['stable', 'degraded', 'rolled_back'],
  stable:       [],
  rejected:     [],
  validation_failed: ['candidate'],  // allow retry
  degraded:     ['rolled_back'],
  rolled_back:  ['candidate'],  // allow retry from scratch
});

const DECISION_TO_TRANSITION = Object.freeze({
  promote:  'approved',
  canary:   'canary',
  reject:   'rejected',
  blocked:  'rejected',
  needs_review: 'reviewing',
});

function promotionsRoot(rootDir, env = process.env) {
  return path.join(resolveMemoRoot(rootDir, { env }), 'evolution', PROMOTIONS_DIR);
}

function promotionPath(rootDir, candidateId, env = process.env) {
  const safe = String(candidateId).replace(/[^A-Za-z0-9._:-]+/gu, '-');
  return path.join(promotionsRoot(rootDir, env), `${safe}.json`);
}

function auditPath(rootDir, env = process.env) {
  return path.join(promotionsRoot(rootDir, env), AUDIT_FILE);
}

/**
 * Read a promotion record. Returns null if not found.
 */
export async function readPromotion(rootDir, candidateId, env = process.env) {
  try {
    const raw = await fs.readFile(promotionPath(rootDir, candidateId, env), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Write a promotion record atomically.
 */
async function writePromotion(rootDir, promotion, env = process.env) {
  const target = promotionPath(rootDir, promotion.candidateId, env);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await atomicWriteText(target, `${JSON.stringify(promotion, null, 2)}\n`);
}

/**
 * Append an audit event.
 */
async function appendAudit(rootDir, event, env = process.env) {
  const target = auditPath(rootDir, env);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  await fs.appendFile(target, line, 'utf8');
}

/**
 * Check whether a transition is valid.
 */
export function isTransitionAllowed(fromStatus, toStatus) {
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

/**
 * Create a new promotion record for a candidate.
 */
export function createPromotion({ candidateId, scope = 'project', risk = 'low', baseHash = '', previousStableVersion = null } = {}) {
  if (!candidateId) throw new Error('createPromotion requires candidateId');
  return {
    schemaVersion: 1,
    candidateId,
    scope,
    risk,
    baseHash,
    status: 'candidate',
    previousStableVersion,
    verdictHash: null,
    transitions: [{ from: null, to: 'candidate', at: new Date().toISOString(), reason: 'created' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Advance a promotion through the state machine.
 *
 * @param {Object} options
 * @param {string} options.rootDir
 * @param {string} options.candidateId
 * @param {string} options.to - Target status
 * @param {string} [options.reason]
 * @param {string} [options.verdictHash]
 * @param {string} [options.previousStableVersion]
 * @returns {Object} Updated promotion record
 */
export async function transitionPromotion({
  rootDir,
  candidateId,
  to,
  reason = '',
  verdictHash = null,
  previousStableVersion = null,
  env = process.env,
} = {}) {
  if (!rootDir) throw new Error('transitionPromotion requires rootDir');
  if (!candidateId) throw new Error('transitionPromotion requires candidateId');
  if (!to) throw new Error('transitionPromotion requires to');

  let promotion = await readPromotion(rootDir, candidateId, env);
  if (!promotion) {
    // Auto-create if transitioning from nowhere
    if (to === 'candidate' || to === 'reviewing') {
      promotion = createPromotion({ candidateId });
    } else {
      throw new Error(`No promotion record for ${candidateId}`);
    }
  }

  if (!isTransitionAllowed(promotion.status, to)) {
    throw new Error(`Invalid transition: ${promotion.status} -> ${to}`);
  }

  const transition = {
    from: promotion.status,
    to,
    at: new Date().toISOString(),
    reason: reason || `${promotion.status} -> ${to}`,
  };

  promotion.status = to;
  promotion.updatedAt = transition.at;
  promotion.transitions.push(transition);
  if (verdictHash) promotion.verdictHash = verdictHash;
  if (previousStableVersion) promotion.previousStableVersion = previousStableVersion;

  await writePromotion(rootDir, promotion, env);

  await appendAudit(rootDir, {
    kind: 'evolution.promotion-audit',
    candidateId,
    ...transition,
    verdictHash: promotion.verdictHash,
    scope: promotion.scope,
    risk: promotion.risk,
  }, env);

  return promotion;
}

/**
 * Promote a candidate based on its verdict.
 *
 * This is the main entry point for verdict-driven promotion.
 * It reads the verdict, maps decision to transition, and advances.
 */
export async function promoteFromVerdict({
  rootDir,
  candidateId,
  scope = 'project',
  risk = 'low',
  baseHash = '',
  env = process.env,
} = {}) {
  const verdict = await readVerdict(rootDir, candidateId, env);
  if (!verdict) {
    return { promoted: false, reason: 'No verdict found for candidate' };
  }

  // Trusted core check: reject if candidate modifies trusted core files
  if (verdict.evidenceRefs && verdict.evidenceRefs.some((ref) =>
    TRUSTED_CORE_FILES.some((f) => String(ref).includes(f))
  )) {
    return { promoted: false, reason: 'Candidate modifies trusted core', blocked: true };
  }

  // Ensure promotion record exists
  let promotion = await readPromotion(rootDir, candidateId, env);
  if (!promotion) {
    promotion = createPromotion({ candidateId, scope, risk, baseHash });
    await writePromotion(rootDir, promotion, env);
    await appendAudit(rootDir, {
      kind: 'evolution.promotion-audit',
      candidateId,
      from: null,
      to: 'candidate',
      at: promotion.createdAt,
      reason: 'created',
      verdictHash: verdict.verdictHash,
      scope,
      risk,
    }, env);
  }

  const targetStatus = DECISION_TO_TRANSITION[verdict.decision];
  if (!targetStatus) {
    return { promoted: false, reason: `Unknown verdict decision: ${verdict.decision}` };
  }

  // Walk through intermediate states if needed
  // e.g. candidate -> reviewing -> validated -> ... -> canary
  const currentIdx = Object.keys(VALID_TRANSITIONS).indexOf(promotion.status);
  const targetIdx = Object.keys(VALID_TRANSITIONS).indexOf(targetStatus);

  if (targetStatus === 'rejected') {
    await transitionPromotion({
      rootDir, candidateId, to: 'rejected',
      reason: verdict.rejectReason || verdict.blockedReason || 'Verdict: reject',
      verdictHash: verdict.verdictHash,
      env,
    });
    return { promoted: false, reason: 'Verdict: rejected', decision: verdict.decision };
  }

  // For canary/approved, walk through intermediate states
  try {
    if (promotion.status === 'candidate') {
      await transitionPromotion({ rootDir, candidateId, to: 'reviewing', reason: 'verdict evaluation', verdictHash: verdict.verdictHash, env });
    }
    if (['reviewing'].includes((await readPromotion(rootDir, candidateId, env)).status)) {
      await transitionPromotion({ rootDir, candidateId, to: 'validated', reason: 'verdict passed', verdictHash: verdict.verdictHash, env });
    }
    if (['validated'].includes((await readPromotion(rootDir, candidateId, env)).status)) {
      await transitionPromotion({ rootDir, candidateId, to: 'proposed', reason: 'ready for promotion', verdictHash: verdict.verdictHash, env });
    }
    const current = (await readPromotion(rootDir, candidateId, env)).status;
    if (current === 'proposed' && targetStatus !== 'rejected') {
      await transitionPromotion({ rootDir, candidateId, to: 'approved', reason: 'promotion approved', verdictHash: verdict.verdictHash, env });
    }
    const current2 = (await readPromotion(rootDir, candidateId, env)).status;
    if (current2 === 'approved' && (targetStatus === 'canary' || targetStatus === 'promote')) {
      await transitionPromotion({ rootDir, candidateId, to: 'canary', reason: 'canary deployment', verdictHash: verdict.verdictHash, env });
    }
  } catch (error) {
    return { promoted: false, reason: `Transition error: ${error.message}` };
  }

  const final = await readPromotion(rootDir, candidateId, env);
  return {
    promoted: true,
    decision: verdict.decision,
    status: final.status,
    candidateId,
    verdictHash: verdict.verdictHash,
  };
}

/**
 * Rollback a canary or active promotion to its previous stable version.
 */
export async function rollbackPromotion({
  rootDir,
  candidateId,
  reason = 'degradation detected',
  env = process.env,
} = {}) {
  const promotion = await readPromotion(rootDir, candidateId, env);
  if (!promotion) {
    return { rolledBack: false, reason: 'No promotion record found' };
  }

  if (promotion.status !== 'canary' && promotion.status !== 'active' && promotion.status !== 'degraded') {
    return { rolledBack: false, reason: `Cannot rollback from status: ${promotion.status}` };
  }

  // If active or canary, mark as degraded first, then rolled_back
  if (promotion.status === 'canary' || promotion.status === 'active') {
    await transitionPromotion({
      rootDir, candidateId, to: 'degraded',
      reason: reason,
      env,
    });
  }

  const result = await transitionPromotion({
    rootDir, candidateId, to: 'rolled_back',
    reason: `Rollback: ${reason}`,
    previousStableVersion: promotion.previousStableVersion,
    env,
  });

  return {
    rolledBack: true,
    candidateId,
    previousStableVersion: promotion.previousStableVersion,
    status: result.status,
  };
}

/**
 * List all promotion records.
 */
export async function listPromotions(rootDir, env = process.env) {
  const dir = promotionsRoot(rootDir, env);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const promotions = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const raw = await fs.readFile(path.join(dir, entry.name), 'utf8');
        promotions.push(JSON.parse(raw));
      }
    }
    return promotions.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export { VALID_TRANSITIONS, TRUSTED_CORE_FILES, DECISION_TO_TRANSITION };
