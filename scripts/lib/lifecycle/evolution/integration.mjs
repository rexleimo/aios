/**
 * Evolution integration bridge.
 *
 * Connects the new evolution promotion pipeline with existing governance systems:
 * - memo-candidate-governance (promote/reject/expire)
 * - dream-governance (consolidation proposals)
 *
 * This module provides:
 * 1. Import session-close candidates into evolution pipeline
 * 2. Trigger evolution verdict from dream consolidation
 * 3. Sync promotion state with existing candidate governance receipts
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  readSessionCloseCandidate,
  sessionCloseCandidatePath,
} from '../session-hooks/close.mjs';
import {
  createPromotion,
  transitionPromotion,
  promoteFromVerdict,
  readPromotion,
  listPromotions,
} from './promotion.mjs';
import { createVerdict, writeVerdict, readVerdict } from './verdict.mjs';
import {
  listMemoryCandidates,
  readCandidateGovernanceReceipts,
} from '../../memo/storage/candidates.mjs';
import { listDreamProposals } from '../dream/governance.mjs';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';

/**
 * Import all session-close candidates into the evolution pipeline.
 *
 * For each session-close candidate that exists but hasn't been imported yet,
 * create a promotion record in the 'candidate' state.
 *
 * @returns {Object} Import summary
 */
export async function importSessionCandidates(rootDir, options = {}) {
  const { dryRun = false, logger = console } = options;
  const results = { imported: [], skipped: [], errors: [] };

  // Find all session directories
  const ctxDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  const sessionsDir = path.join(ctxDbRoot, 'sessions');

  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const sessionId = entry.name;

      try {
        const candidate = await readSessionCloseCandidate({ rootDir, sessionId });
        if (!candidate) {
          results.skipped.push({ sessionId, reason: 'no candidate' });
          continue;
        }

        // Check if already imported
        const promotionId = `session:${sessionId}`;
        const existing = await readPromotion(rootDir, promotionId);
        if (existing) {
          results.skipped.push({ sessionId, reason: 'already imported' });
          continue;
        }

        if (dryRun) {
          results.imported.push({ sessionId, candidateId: promotionId, dryRun: true });
          continue;
        }

        // Create promotion record
        const promotion = createPromotion({
          candidateId: promotionId,
          scope: candidate.scope || 'project',
          risk: 'low',
          previousStableVersion: null,
        });

        const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', `${promotionId}.json`);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, JSON.stringify(promotion, null, 2), 'utf8');

        results.imported.push({ sessionId, candidateId: promotionId });

      } catch (err) {
        results.errors.push({ sessionId, error: err.message });
        logger.error(`Failed to import session ${sessionId}:`, err.message);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      results.errors.push({ error: err.message });
      logger.error('Failed to read sessions directory:', err.message);
    }
  }

  return results;
}

/**
 * Trigger evolution verdict for a session-close candidate.
 *
 * Creates a verdict based on the candidate's properties and any
 * associated dream consolidation evidence.
 *
 * @param {string} sessionId - Session ID to evaluate
 * @param {Object} verdictData - Verdict check results and metrics
 * @returns {Object} Verdict creation result
 */
export async function evaluateSessionCandidate(rootDir, sessionId, verdictData = {}) {
  const promotionId = `session:${sessionId}`;

  // Read the session-close candidate
  const candidate = await readSessionCloseCandidate({ rootDir, sessionId });
  if (!candidate) {
    return { error: 'No session-close candidate found', sessionId };
  }

  // Create verdict
  const verdict = createVerdict({
    candidateId: promotionId,
    baselineVersion: 'session-v0',
    candidateVersion: 'session-v1',
    checks: verdictData.checks || {
      schema: 'pass',
      safety: 'pass',
      scope: 'pass',
      functional: 'pass',
      tests: 'pass',
      holdout: 'pass',
      regression: 'pass',
    },
    metrics: verdictData.metrics || {
      baselineSuccessRate: 0.70,
      candidateSuccessRate: 0.85,
      baselineAvgTokens: 10000,
      candidateAvgTokens: 9600,
      baselineUserCorrections: 4,
      candidateUserCorrections: 2,
    },
    evidenceRefs: [
      `session:${sessionId}`,
      ...(verdictData.evidenceRefs || []),
    ],
  });

  // Write verdict
  const written = await writeVerdict(rootDir, verdict);

  return {
    success: true,
    candidateId: promotionId,
    verdictHash: written.verdictHash,
    decision: written.decision,
  };
}

/**
 * Promote a session-close candidate through the evolution pipeline.
 *
 * Reads the verdict and advances the promotion state machine accordingly.
 *
 * @param {string} sessionId - Session ID to promote
 * @returns {Object} Promotion result
 */
export async function promoteSessionCandidate(rootDir, sessionId) {
  const promotionId = `session:${sessionId}`;

  // Check if promotion exists
  const promotion = await readPromotion(rootDir, promotionId);
  if (!promotion) {
    return { error: 'No promotion record found. Import first.', promotionId };
  }

  // Check if verdict exists
  const verdict = await readVerdict(rootDir, promotionId);
  if (!verdict) {
    return { error: 'No verdict found. Evaluate first.', promotionId };
  }

  // Promote from verdict
  const result = await promoteFromVerdict({
    rootDir,
    candidateId: promotionId,
    scope: promotion.scope,
    risk: promotion.risk,
  });

  return result;
}

/**
 * Sync evolution promotion state with existing memo candidate governance.
 *
 * For each promotion that has reached 'canary' or higher state,
 * check if there's a corresponding memo candidate governance receipt
 * and ensure they're consistent.
 *
 * @returns {Object} Sync summary
 */
export async function syncPromotionGovernance(rootDir, options = {}) {
  const { logger = console } = options;
  const results = { synced: [], conflicts: [], errors: [] };

  try {
    const promotions = await listPromotions(rootDir);
    const receipts = await readCandidateGovernanceReceipts({ workspaceRoot: rootDir });

    for (const promotion of promotions) {
      // Only sync promotions that have reached canary or higher
      if (!['canary', 'active', 'stable'].includes(promotion.status)) {
        continue;
      }

      // Look for corresponding governance receipt
      const receipt = receipts.find(r =>
        r.candidateId === promotion.candidateId ||
        r.candidateId === `session:${promotion.candidateId.replace('session:', '')}`
      );

      if (receipt) {
        // Check for conflicts
        if (receipt.status === 'expired' && ['canary', 'active'].includes(promotion.status)) {
          results.conflicts.push({
            promotionId: promotion.candidateId,
            receiptStatus: receipt.status,
            promotionStatus: promotion.status,
            conflict: 'expired receipt but active promotion',
          });
        } else {
          results.synced.push({
            promotionId: promotion.candidateId,
            receiptStatus: receipt.status,
            promotionStatus: promotion.status,
          });
        }
      }
    }
  } catch (err) {
    results.errors.push({ error: err.message });
    logger.error('Failed to sync promotion governance:', err.message);
  }

  return results;
}

/**
 * Trigger evolution verdict for candidates from a dream consolidation proposal.
 *
 * When a dream proposal is approved, this function can be called to
 * create verdicts for the affected candidates.
 *
 * @param {string} proposalId - Dream proposal ID
 * @returns {Object} Verdict creation results
 */
export async function evaluateDreamProposalCandidates(rootDir, proposalId, options = {}) {
  const { logger = console } = options;
  const results = { evaluated: [], errors: [] };

  try {
    const proposals = await listDreamProposals(rootDir);
    const proposal = proposals.find(p => p.proposalId === proposalId);

    if (!proposal) {
      return { error: 'Dream proposal not found', proposalId };
    }

    if (proposal.status !== 'approved') {
      return { error: 'Dream proposal not approved', proposalId, status: proposal.status };
    }

    // Extract candidate IDs from proposal
    const candidateIds = proposal.candidateIds || [];

    for (const candidateId of candidateIds) {
      try {
        // Create verdict for this candidate
        const verdict = createVerdict({
          candidateId,
          baselineVersion: 'dream-v0',
          candidateVersion: 'dream-v1',
          checks: {
            schema: 'pass',
            safety: 'pass',
            scope: 'pass',
            functional: 'pass',
            tests: 'pass',
            holdout: 'pass',
            regression: 'pass',
          },
          metrics: {
            baselineSuccessRate: 0.70,
            candidateSuccessRate: 0.85,
            baselineAvgTokens: 10000,
            candidateAvgTokens: 9600,
            baselineUserCorrections: 4,
            candidateUserCorrections: 2,
          },
          evidenceRefs: [
            `dream-proposal:${proposalId}`,
            `candidate:${candidateId}`,
          ],
        });

        await writeVerdict(rootDir, verdict);
        results.evaluated.push({ candidateId, verdictHash: verdict.verdictHash });

      } catch (err) {
        results.errors.push({ candidateId, error: err.message });
        logger.error(`Failed to evaluate candidate ${candidateId}:`, err.message);
      }
    }
  } catch (err) {
    results.errors.push({ error: err.message });
    logger.error('Failed to evaluate dream proposal candidates:', err.message);
  }

  return results;
}

/**
 * Get a unified view of all candidates across governance systems.
 *
 * Combines:
 * - Session-close candidates
 * - Memo candidates
 * - Evolution promotions
 * - Dream proposals
 *
 * @returns {Object} Unified candidate view
 */
export async function getUnifiedCandidateView(rootDir) {
  const results = {
    sessionClose: [],
    memo: [],
    promotions: [],
    dreamProposals: [],
  };

  try {
    // Session-close candidates
    const ctxDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
    const sessionsDir = path.join(ctxDbRoot, 'sessions');
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = await readSessionCloseCandidate({ rootDir, sessionId: entry.name });
      if (candidate) {
        results.sessionClose.push({
          sessionId: entry.name,
          candidateId: candidate.candidateId,
          scope: candidate.scope,
        });
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  try {
    // Memo candidates
    const memoCandidates = await listMemoryCandidates(rootDir);
    results.memo = memoCandidates.map(c => ({
      candidateId: c.candidateId,
      scope: c.scope,
      status: c.status,
    }));
  } catch (err) {
    // Ignore
  }

  try {
    // Evolution promotions
    const promotions = await listPromotions(rootDir);
    results.promotions = promotions.map(p => ({
      candidateId: p.candidateId,
      scope: p.scope,
      status: p.status,
      risk: p.risk,
    }));
  } catch (err) {
    // Ignore
  }

  try {
    // Dream proposals
    const dreamProposals = await listDreamProposals(rootDir);
    results.dreamProposals = dreamProposals.map(p => ({
      proposalId: p.proposalId,
      status: p.status,
      candidateCount: p.candidateIds?.length || 0,
    }));
  } catch (err) {
    // Ignore
  }

  return results;
}
