/**
 * Dream — sleep-time memory consolidation.
 * Pure rule-driven: taxonomy classification + Jaccard dedup + TTL expiry.
 * NO LLM calls. NO daemon. CLI command called manually or at session end.
 */

import path from 'node:path';

import { classifyEvent, isExpired, TAXONOMY_CLASSES } from './taxonomy.mjs';
import { dedupDecisions } from './dedup.mjs';
import { resolveMemoRoot } from '../../aios/state-root.mjs';
import { collectEvents } from '../../memo/storage/events-read.mjs';
import { getActiveMemoStorage } from '../../memo/storage/config.mjs';
import { atomicWriteText, sha256Hex } from '../../memo/storage/fs-io.mjs';
import { readPinnedMemo } from '../../memo/storage/pinned.mjs';


/**
 * Load all memo events for specified spaces, respecting the active storage config.
 */
async function loadEvents(rootDir, spaces, env = process.env) {
  const storage = await getActiveMemoStorage(rootDir, { env });
  const allEvents = [];

  for (const space of spaces) {
    const { events } = await collectEvents(rootDir, { storage, space, env });
    allEvents.push(...events);
  }

  return { events: allEvents, storage };
}

/**
 * Enhance classification by checking pinned state from pinned memo files.
 * An event is considered pinned if its text content appears in the pinned file
 * for its space, OR if it has a "pinned" ref tag.
 */
async function enrichPinnedState(rootDir, events, storage, env = process.env) {
  const pinnedTextBySpace = new Map();

  for (const event of events) {
    const spaceKey = event.spaceKey || 'default';
    if (!pinnedTextBySpace.has(spaceKey)) {
      const pinnedContent = await readPinnedMemo(rootDir, { storage, space: event.space || 'default', env });
      pinnedTextBySpace.set(spaceKey, pinnedContent);
    }
  }

  return events.map((event) => {
    const spaceKey = event.spaceKey || 'default';
    const pinnedContent = pinnedTextBySpace.get(spaceKey) || '';
    const refs = Array.isArray(event.refs) ? event.refs : [];
    // An event is pinned if: refs includes "pinned", OR its text appears in pinned content
    const textInPinned = pinnedContent.includes(event.text);
    const hasPinnedRef = refs.includes('pinned');
    if (textInPinned || hasPinnedRef) {
      return { ...event, _pinned: true };
    }
    return { ...event, _pinned: false };
  });
}

/**
 * Override classifyEvent to use enriched pinned state.
 */
function classifyWithPinned(event, now = Date.now()) {
  // SENSITIVE first
  const scope = event.scope || 'project_shared';
  if (scope === 'agent_private') {
    return { class: TAXONOMY_CLASSES.SENSITIVE, ttlDays: -1, event };
  }

  // OPERATIONAL
  const text = String(event.text || '');
  const refs = Array.isArray(event.refs) ? event.refs : [];
  if (text.startsWith('[ops]') || refs.includes('ops')) {
    return { class: TAXONOMY_CLASSES.OPERATIONAL, ttlDays: 3, event };
  }

  // STABLE_PREFERENCE — project_shared AND pinned
  if (scope === 'project_shared' && event._pinned) {
    return { class: TAXONOMY_CLASSES.STABLE_PREFERENCE, ttlDays: -1, event };
  }

  // RECENT_SNAPSHOT — created within last 24h
  const ts = event.ts ? new Date(event.ts).getTime() : 0;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  if (Number.isFinite(ts) && (now - ts) < MS_PER_DAY) {
    return { class: TAXONOMY_CLASSES.RECENT_SNAPSHOT, ttlDays: 7, event };
  }

  // DURABLE_CONTEXT — project_shared, not pinned, not recent
  if (scope === 'project_shared') {
    return { class: TAXONOMY_CLASSES.DURABLE_CONTEXT, ttlDays: 90, event };
  }

  // Everything else
  return { class: TAXONOMY_CLASSES.RECENT_SNAPSHOT, ttlDays: 7, event };
}

function ownerKey(event = {}) {
  return `${String(event.scope || 'project_shared').trim().toLowerCase()}:${String(event.agent || '').trim().toLowerCase() || 'legacy'}`;
}

function dedupWithinOwner(events = []) {
  const groups = new Map();
  for (const event of events) {
    const key = ownerKey(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.values()].flatMap((group) => dedupDecisions(group));
}

function buildTombstoneActions(plan) {
  const actions = plan.expire.map((eventId) => ({
    action: 'tombstone',
    eventId,
    reason: 'ttl_expired',
  }));
  for (const decision of plan.dedup) {
    for (const eventId of decision.drop) {
      actions.push({
        action: 'tombstone',
        eventId,
        reason: 'deduplicate',
        keepEventId: decision.keep,
      });
    }
  }
  return actions;
}

async function writeDreamProposal({ rootDir, storage, spaces, plan, events, createdAt, env = process.env }) {
  const actions = buildTombstoneActions(plan);
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const proposalId = `dream:${createdAt.replace(/[-:.TZ]/gu, '')}:${sha256Hex(JSON.stringify(actions)).slice(0, 8)}`;
  const proposal = {
    schemaVersion: 1,
    kind: 'memo.dream-consolidation-proposal',
    proposalId,
    status: 'proposed',
    createdAt,
    source: { storage, spaces },
    summary: plan.summary,
    actions,
    sourceManifest: actions.map((action) => {
      const event = byId.get(action.eventId);
      return {
        eventId: action.eventId,
        scope: event?.scope || 'project_shared',
        agent: event?.agent || '',
        sourceHash: event ? sha256Hex(JSON.stringify(event)) : '',
      };
    }),
  };
  const target = path.join(resolveMemoRoot(rootDir, { env }), 'dream', 'proposals', `${proposalId.replace(/:/gu, '-')}.json`);
  await atomicWriteText(target, `${JSON.stringify(proposal, null, 2)}\n`);
  return { proposal, proposalPath: target };
}

/**
 * Main entry point for dream consolidation.
 *
 * @param {Object} options
 * @param {string} options.rootDir - Workspace root directory
 * @param {string} options.mode - 'preview' (returns plan) or 'apply' (executes)
 * @param {Array} options.spaces - Spaces to process (default: ['default'])
 * @returns {Object} Plan or execution result
 */
export async function runDream({ rootDir, mode = 'preview', spaces = ['default'], env = process.env } = {}) {
  const now = Date.now();
  const { events: rawEvents, storage } = await loadEvents(rootDir, spaces, env);

  // Enrich with pinned state from actual pinned files
  const governableEvents = rawEvents.filter((event) => event.claimStatus !== 'candidate');
  const events = await enrichPinnedState(rootDir, governableEvents, storage, env);

  // Classify all events
  const classified = events.map((event) => classifyWithPinned(event, now));

  // Skip SENSITIVE (agent_private) entirely
  const nonSensitive = classified.filter((c) => c.class !== TAXONOMY_CLASSES.SENSITIVE);

  // Find expired events
  const expiredIds = [];
  for (const c of nonSensitive) {
    if (isExpired(c, now)) {
      expiredIds.push(c.event.eventId);
    }
  }

  // Find duplicate clusters among non-expired, non-sensitive events
  const stillActive = nonSensitive.filter((c) => !expiredIds.includes(c.event.eventId));
  const dedupResults = dedupWithinOwner(stillActive.map((c) => c.event));

  // Build the plan
  const plan = {
    dedup: dedupResults,
    expire: expiredIds,
    totalAffected: dedupResults.reduce((sum, d) => sum + d.drop.length, 0) + expiredIds.length,
    summary: {
      totalEvents: events.length,
      sensitiveSkipped: classified.filter((c) => c.class === TAXONOMY_CLASSES.SENSITIVE).length,
      stablePreserved: classified.filter((c) => c.class === TAXONOMY_CLASSES.STABLE_PREFERENCE).length,
      expiredCount: expiredIds.length,
      dedupClusters: dedupResults.length,
      dedupDrops: dedupResults.reduce((sum, d) => sum + d.drop.length, 0),
    },
  };

  if (mode === 'preview') {
    return plan;
  }

  // Apply persists an auditable tombstone proposal. Source memo rows remain
  // immutable until a separate reviewed retention step is introduced.
  const { events: allStoredEvents } = await collectEvents(rootDir, { storage, env });
  const createdAt = new Date(now).toISOString();
  const { proposal, proposalPath } = await writeDreamProposal({
    rootDir,
    storage,
    spaces,
    plan,
    events: allStoredEvents,
    createdAt,
    env,
  });

  return {
    ...plan,
    applied: true,
    application: 'proposal-only',
    proposalOnly: true,
    sourceMutated: false,
    proposalId: proposal.proposalId,
    proposalPath,
    proposedRemovalCount: proposal.actions.length,
    removedCount: 0,
    survivorsCount: allStoredEvents.length,
  };
}

export {
  approveDreamProposal,
  archiveDreamProposal,
  gcDreamProposal,
  inspectDreamProposal,
  listDreamProposals,
  readDreamArchivedEventIds,
  readDreamGovernanceReceipts,
  rejectDreamProposal,
  restoreDreamProposal,
  runDreamGovernanceCommand,
} from './governance.mjs';
