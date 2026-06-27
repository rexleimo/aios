/**
 * Dream — sleep-time memory consolidation.
 * Pure rule-driven: taxonomy classification + Jaccard dedup + TTL expiry.
 * NO LLM calls. NO daemon. CLI command called manually or at session end.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { classifyEvent, isExpired, TAXONOMY_CLASSES } from './taxonomy.mjs';
import { dedupDecisions, findDuplicateClusters, pickKeepWinner } from './dedup.mjs';
import { collectEvents } from '../../memo/storage/events-read.mjs';
import { getActiveMemoStorage } from '../../memo/storage/config.mjs';
import { normalizeMemoStorageName } from '../../memo/storage/normalizers.mjs';
import { atomicWriteText } from '../../memo/storage/fs-io.mjs';
import { fileEventsPath } from '../../memo/storage/paths.mjs';
import { readPinnedMemo } from '../../memo/storage/pinned.mjs';
import { listMemoEvents } from '../../memo/storage/query.mjs';

/**
 * Load all memo events for specified spaces, respecting the active storage config.
 */
async function loadEvents(rootDir, spaces) {
  const storage = await getActiveMemoStorage(rootDir);
  const allEvents = [];

  for (const space of spaces) {
    const { events } = await collectEvents(rootDir, { storage, space });
    allEvents.push(...events);
  }

  return { events: allEvents, storage };
}

/**
 * Enhance classification by checking pinned state from pinned memo files.
 * An event is considered pinned if its text content appears in the pinned file
 * for its space, OR if it has a "pinned" ref tag.
 */
async function enrichPinnedState(rootDir, events, storage) {
  const pinnedTextBySpace = new Map();

  for (const event of events) {
    const spaceKey = event.spaceKey || 'default';
    if (!pinnedTextBySpace.has(spaceKey)) {
      const pinnedContent = await readPinnedMemo(rootDir, { storage, space: event.space || 'default' });
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

/**
 * Main entry point for dream consolidation.
 *
 * @param {Object} options
 * @param {string} options.rootDir - Workspace root directory
 * @param {string} options.mode - 'preview' (returns plan) or 'apply' (executes)
 * @param {Array} options.spaces - Spaces to process (default: ['default'])
 * @returns {Object} Plan or execution result
 */
export async function runDream({ rootDir, mode = 'preview', spaces = ['default'] } = {}) {
  const now = Date.now();
  const { events: rawEvents, storage } = await loadEvents(rootDir, spaces);

  // Enrich with pinned state from actual pinned files
  const events = await enrichPinnedState(rootDir, rawEvents, storage);

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
  const dedupResults = dedupDecisions(stillActive.map((c) => c.event));

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

  // Apply mode: actually remove expired and dedup-loser events from storage
  const idsToRemove = new Set(expiredIds);
  for (const d of dedupResults) {
    for (const dropId of d.drop) {
      idsToRemove.add(dropId);
    }
  }

  // Reload all events from storage and filter out removed ones
  const { events: allStoredEvents } = await collectEvents(rootDir, { storage });
  const survivors = allStoredEvents.filter((e) => !idsToRemove.has(e.eventId));

  // Rewrite the storage with survivors only
  if (storage === 'file') {
    // For file storage, rewrite the JSONL atomically
    const lines = survivors.map((e) => JSON.stringify(e)).join('\n');
    const content = lines.length > 0 ? `${lines}\n` : '';
    await atomicWriteText(fileEventsPath(rootDir), content);
  } else {
    // For split storage, delete the individual JSON files for removed events
    // and keep the rest. We need to find each removed event's file.
    const { collectRecursiveFiles } = await import('../../memo/storage/fs-io.mjs');
    const { splitEventsRoot } = await import('../../memo/storage/paths.mjs');
    const { sanitizeSpace } = await import('../../memo/storage/normalizers.mjs');

    const removedEvents = allStoredEvents.filter((e) => idsToRemove.has(e.eventId));

    for (const removed of removedEvents) {
      const safeSpace = removed.spaceKey || sanitizeSpace(removed.space || 'default');
      const seq = Number.isFinite(removed.seq) ? removed.seq : 0;
      const paddedSeq = String(seq).padStart(12, '0');
      const filePath = path.join(splitEventsRoot(rootDir), safeSpace, `${paddedSeq}.json`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        // File already gone — fine
      }
    }
  }

  // Rebuild derived index after mutation
  try {
    const { rebuildMemoStorage } = await import('../../memo/storage/derived.mjs');
    await rebuildMemoStorage(rootDir, { storage });
  } catch {
    // Derived rebuild is optional — don't fail the whole dream if it's missing
  }

  return {
    ...plan,
    applied: true,
    removedCount: idsToRemove.size,
    survivorsCount: survivors.length,
  };
}
