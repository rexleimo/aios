import { getActiveMemoStorage } from './storage/config.mjs';
import {
  foldCandidateTerminalStates,
  readCandidateGovernanceReceipts,
} from './storage/candidates.mjs';
import { SUPPORTED_MEMO_STORAGES } from './storage/constants.mjs';
import { collectEvents } from './storage/events-read.mjs';
import { readMemoFeedbackScores } from './storage/feedback.mjs';
import {
  PINNED_DEFAULT_MAX_CHARS,
  normalizePinnedContent,
  readPinnedByStorage,
  renderPinnedBlock,
} from './storage/pinned.mjs';
import { normalizeMemoStorageName } from './storage/normalizers.mjs';

/* G2 observability: one report over the memo plane — per-space volume,
 * invalidation ratio, candidate backlog, feedback adoption, pinned budget.
 * Derived read-only from the same stores recall reads; doctor keeps its own
 * storage-availability checks and intentionally does not duplicate these. */

function adoptionRate(useful, impressions) {
  const total = (useful || 0) + (impressions || 0);
  return total > 0 ? useful / total : null;
}

function percent(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

export async function buildMemoryReport(workspaceRoot, {
  storage = '',
  now = new Date(),
  env = process.env,
} = {}) {
  if (!workspaceRoot) throw new Error('buildMemoryReport requires workspaceRoot');
  const active = storage
    ? normalizeMemoStorageName(storage)
    : await getActiveMemoStorage(workspaceRoot, { env });
  const { events } = await collectEvents(workspaceRoot, {
    storage: active,
    space: '',
    tolerateMalformed: true,
    env,
  });
  const feedback = await readMemoFeedbackScores({ workspaceRoot, env });
  const receipts = await readCandidateGovernanceReceipts({ workspaceRoot, env });
  const terminalStates = foldCandidateTerminalStates(receipts);

  const supersededIds = new Set();
  for (const event of events) {
    for (const id of (Array.isArray(event.supersedes) ? event.supersedes : [])) {
      if (id) supersededIds.add(id);
    }
  }

  const spacesBykey = new Map();
  const feedbackTotals = { impressions: 0, useful: 0 };
  const candidateTally = { pending: 0, promoted: 0, rejected: 0, expired: 0 };
  for (const event of events) {
    const spaceKey = event.spaceKey || 'default';
    let bucket = spacesBykey.get(spaceKey);
    if (!bucket) {
      bucket = {
        space: event.space || spaceKey,
        spaceKey,
        events: 0,
        chars: 0,
        superseded: 0,
        oldestTs: null,
        newestTs: null,
        impressions: 0,
        useful: 0,
        candidates: 0,
      };
      spacesBykey.set(spaceKey, bucket);
    }
    bucket.events += 1;
    bucket.chars += String(event.text || '').length;
    if (supersededIds.has(event.eventId)) bucket.superseded += 1;
    const ts = String(event.ts || '');
    if (ts) {
      if (!bucket.oldestTs || ts < bucket.oldestTs) bucket.oldestTs = ts;
      if (!bucket.newestTs || ts > bucket.newestTs) bucket.newestTs = ts;
    }
    const scores = feedback.get(event.eventId);
    if (scores) {
      bucket.impressions += scores.impressions;
      bucket.useful += scores.useful;
      feedbackTotals.impressions += scores.impressions;
      feedbackTotals.useful += scores.useful;
    }
    if (event.scope === 'project_shared' && event.claimStatus === 'candidate') {
      bucket.candidates += 1;
      const status = terminalStates.get(event.eventId)?.status || 'pending';
      if (candidateTally[status] !== undefined) candidateTally[status] += 1;
    }
  }

  const spaces = [...spacesBykey.values()]
    .map((bucket) => ({
      ...bucket,
      invalidationRatio: bucket.events > 0 ? bucket.superseded / bucket.events : 0,
      adoptionRate: adoptionRate(bucket.useful, bucket.impressions),
    }))
    .sort((a, b) => a.spaceKey.localeCompare(b.spaceKey));

  const pinned = [];
  for (const storageName of SUPPORTED_MEMO_STORAGES) {
    const blocks = await readPinnedByStorage(workspaceRoot, storageName, { env });
    for (const block of blocks) {
      const rendered = renderPinnedBlock(block.content, { maxChars: PINNED_DEFAULT_MAX_CHARS });
      pinned.push({
        source: `memo:${storageName}:${block.safeSpace}`,
        chars: normalizePinnedContent(block.content).length,
        maxChars: rendered.maxChars,
        truncated: rendered.truncated,
      });
    }
  }

  return {
    generatedAt: now.toISOString(),
    storage: active,
    totals: {
      events: events.length,
      spaces: spaces.length,
      superseded: events.filter((event) => supersededIds.has(event.eventId)).length,
    },
    spaces,
    candidates: {
      ...candidateTally,
      backlog: candidateTally.pending,
    },
    feedback: {
      impressions: feedbackTotals.impressions,
      useful: feedbackTotals.useful,
      adoptionRate: adoptionRate(feedbackTotals.useful, feedbackTotals.impressions),
    },
    pinned,
  };
}

export function renderMemoryReport(report) {
  const lines = [];
  lines.push(`Memory report (storage: ${report.storage}, generated ${report.generatedAt})`);
  lines.push('Spaces:');
  if (report.spaces.length === 0) lines.push('  (none)');
  for (const space of report.spaces) {
    const span = space.oldestTs && space.newestTs ? `, ${space.oldestTs} -> ${space.newestTs}` : '';
    lines.push(`  ${space.spaceKey}: ${space.events} events, ${space.chars} chars, ${space.superseded} superseded (${percent(space.invalidationRatio)} invalidated), ${space.candidates} candidates, feedback ${space.impressions} impressions/${space.useful} useful (adoption ${percent(space.adoptionRate)})${span}`);
  }
  lines.push(`Feedback: ${report.feedback.impressions} impressions, ${report.feedback.useful} useful, adoption ${percent(report.feedback.adoptionRate)}`);
  lines.push(`Candidates: ${report.candidates.pending} pending, ${report.candidates.promoted} promoted, ${report.candidates.rejected} rejected, ${report.candidates.expired} expired (backlog ${report.candidates.backlog})`);
  lines.push('Pinned blocks:');
  if (report.pinned.length === 0) lines.push('  (none)');
  for (const entry of report.pinned) {
    lines.push(`  ${entry.truncated ? '[over-budget]' : '[ok]'} ${entry.source} ${entry.chars}/${entry.maxChars} chars${entry.truncated ? ', truncated' : ''}`);
  }
  return lines.join('\n');
}
