/**
 * Evolution status reporter.
 *
 * Provides a human-readable and JSON-readable summary of the current
 * evolution pipeline state: pending candidates, trigger policy,
 * last run, and recommended next action.
 */

import {
  evaluateTrigger,
  readTriggerState,
  countPendingCandidates,
  EVOLUTION_TRIGGER_DEFAULTS,
} from './trigger.mjs';
import { readSessionCloseCandidate } from '../session-hooks/close.mjs';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Build a full status report for the evolution pipeline.
 *
 * @param {Object} options
 * @param {string} options.rootDir - Workspace root
 * @param {Object} [options.config] - Override default trigger config
 * @param {string} [options.format] - 'json' or 'human' (default: 'human')
 * @returns {Object} Status report
 */
export async function getEvolutionStatus({
  rootDir,
  config = EVOLUTION_TRIGGER_DEFAULTS,
  format = 'human',
  env = process.env,
} = {}) {
  const triggerDecision = await evaluateTrigger({ rootDir, config, env });
  const state = await readTriggerState(rootDir, env);

  // Collect candidate summaries (lightweight — no full text)
  const candidates = await listCandidateSummaries(rootDir, env);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    kind: 'evolution-status',
    pendingCandidates: triggerDecision.pendingCandidates,
    lastRunAt: state.lastRunAt || null,
    nextEligibleAt: triggerDecision.nextEligibleAt || null,
    trigger: triggerDecision.trigger,
    action: triggerDecision.action,
    reason: triggerDecision.reason,
    config: triggerDecision.config,
    candidates: candidates.slice(0, 20), // Cap at 20 for readability
    candidatesTruncated: candidates.length > 20,
  };

  if (format === 'json') {
    return report;
  }

  // Human-readable rendering
  return { ...report, rendered: renderHumanStatus(report) };
}

/**
 * List lightweight candidate summaries from session-close sidecars.
 */
async function listCandidateSummaries(rootDir, env = process.env) {
  const contextDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env });
  const sessionsRoot = path.join(contextDbRoot, 'sessions');

  let entries = [];
  try {
    entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const summaries = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const candidatePath = path.join(sessionsRoot, entry.name, 'session-close-memory-candidate.json');
    try {
      const candidate = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
      if (candidate?.claimStatus !== 'candidate') continue;
      summaries.push({
        candidateId: candidate.candidateId,
        sessionId: candidate.sessionId,
        createdAt: candidate.createdAt,
        textPreview: String(candidate.text || '').slice(0, 80),
        scope: candidate.scope,
      });
    } catch {
      // Skip unreadable candidates
    }
  }
  return summaries;
}

/**
 * Render a human-readable status string.
 */
function renderHumanStatus(report) {
  const lines = [];
  lines.push(`Evolution Pipeline Status`);
  lines.push(`${'─'.repeat(40)}`);
  lines.push(`Pending candidates: ${report.pendingCandidates}`);
  lines.push(`Last consolidation:  ${report.lastRunAt || 'never'}`);
  lines.push(`Next eligible:      ${report.nextEligibleAt || 'now (first run)'}`);
  lines.push(`Trigger:            ${report.trigger}`);
  lines.push(`Action:             ${report.action}`);
  lines.push(`Reason:             ${report.reason}`);
  lines.push('');
  lines.push(`Config:`);
  lines.push(`  minCandidates:    ${report.config.minCandidates}`);
  lines.push(`  cooldownHours:    ${report.config.cooldownHours}`);
  lines.push('');

  if (report.candidates.length > 0) {
    lines.push(`Candidates (${report.candidates.length}${report.candidatesTruncated ? '+' : ''}):`);
    for (const c of report.candidates) {
      lines.push(`  - ${c.candidateId} (${c.createdAt?.slice(0, 10) || '?'})`);
      lines.push(`    ${c.textPreview}...`);
    }
  } else {
    lines.push(`No pending candidates.`);
  }

  lines.push('');
  if (report.action === 'run') {
    lines.push(`▶ Run: aios evolution run`);
  } else if (report.action === 'review') {
    lines.push(`▶ Review: aios dream --mode preview`);
  } else {
    lines.push(`No action needed. Continue working — candidates accumulate on session close.`);
  }

  return lines.join('\n');
}
