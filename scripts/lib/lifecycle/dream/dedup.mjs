/**
 * Dream dedup — Jaccard word-overlap similarity + cluster detection + winner selection.
 * Pure deterministic, no LLM calls.
 */

/**
 * Compute Jaccard similarity between two texts based on word sets.
 * Words are obtained by splitting on whitespace and lowercasing.
 * Returns a value between 0 (no overlap) and 1 (identical word sets).
 */
export function textSimilarity(a, b) {
  const wordsA = new Set(String(a || '').toLowerCase().split(/\s+/u).filter((w) => w.length > 0));
  const wordsB = new Set(String(b || '').toLowerCase().split(/\s+/u).filter((w) => w.length > 0));

  if (wordsA.size === 0 && wordsB.size === 0) return 1; // both empty → identical
  if (wordsA.size === 0 || wordsB.size === 0) return 0; // one empty → no overlap

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection += 1;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find duplicate/near-duplicate clusters among memo events.
 * Groups events where pairwise similarity > threshold within the same space.
 * Uses single-linkage clustering: if A~B and B~C, then {A,B,C} form one cluster.
 *
 * @param {Array} events - Array of memo event objects
 * @param {number} threshold - Minimum Jaccard similarity to consider duplicates (default 0.7)
 * @returns {Array} Array of clusters, each cluster is an array of event objects
 */
export function findDuplicateClusters(events, threshold = 0.7) {
  // Group by space first — only compare within same space
  const bySpace = new Map();
  for (const event of events) {
    const spaceKey = event.spaceKey || event.space || 'default';
    if (!bySpace.has(spaceKey)) bySpace.set(spaceKey, []);
    bySpace.get(spaceKey).push(event);
  }

  const allClusters = [];

  for (const [, spaceEvents] of bySpace) {
    if (spaceEvents.length < 2) continue;

    // Build adjacency: pairs with similarity above threshold
    const adj = new Map(); // eventId → Set<eventId>
    for (const event of spaceEvents) {
      adj.set(event.eventId, new Set());
    }

    for (let i = 0; i < spaceEvents.length; i += 1) {
      for (let j = i + 1; j < spaceEvents.length; j += 1) {
        const sim = textSimilarity(spaceEvents[i].text, spaceEvents[j].text);
        if (sim >= threshold) {
          adj.get(spaceEvents[i].eventId).add(spaceEvents[j].eventId);
          adj.get(spaceEvents[j].eventId).add(spaceEvents[i].eventId);
        }
      }
    }

    // Single-linkage clustering via BFS
    const visited = new Set();
    for (const event of spaceEvents) {
      if (visited.has(event.eventId)) continue;
      const cluster = [];
      const queue = [event.eventId];
      visited.add(event.eventId);
      while (queue.length > 0) {
        const current = queue.shift();
        const currentEvent = spaceEvents.find((e) => e.eventId === current);
        if (currentEvent) cluster.push(currentEvent);
        for (const neighbor of adj.get(current)) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      // Only report clusters with 2+ events
      if (cluster.length >= 2) {
        allClusters.push(cluster);
      }
    }
  }

  return allClusters;
}

/**
 * Pick the winner from a duplicate cluster.
 * Winner criteria: most recent ts, then longest text as tiebreaker.
 * Returns { keep: eventId, drop: [eventId, ...] }.
 */
export function pickKeepWinner(cluster) {
  if (!cluster || cluster.length === 0) {
    return { keep: '', drop: [] };
  }
  if (cluster.length === 1) {
    return { keep: cluster[0].eventId, drop: [] };
  }

  // Sort by: most recent ts first, then longest text
  const sorted = [...cluster].sort((a, b) => {
    const tsCompare = String(b.ts || '').localeCompare(String(a.ts || ''));
    if (tsCompare !== 0) return tsCompare;
    // Tiebreaker: longer text wins
    return String(b.text || '').length - String(a.text || '').length;
  });

  const keep = sorted[0].eventId;
  const drop = sorted.slice(1).map((e) => e.eventId);

  return { keep, drop };
}

/**
 * Convenience: run dedup over events and return { keep, drop } decisions
 * for all clusters.
 */
export function dedupDecisions(events, threshold = 0.7) {
  const clusters = findDuplicateClusters(events, threshold);
  return clusters.map(pickKeepWinner);
}
