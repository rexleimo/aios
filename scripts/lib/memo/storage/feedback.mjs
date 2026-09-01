import path from 'node:path';

import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { appendText } from './fs-io.mjs';

// Recall feedback loop, stage one of the memory optimizer's missing signal:
// today every recall behaves identically forever because nothing records
// whether a surfaced memory was ever useful. This module stores lightweight
// impressions (memory injected into a prompt) and useful marks (memory a
// consumer explicitly adopted) in an append-only telemetry JSONL, and folds
// them into per-event scores that search uses to weight recall.
export const RECALL_FEEDBACK_FILE = 'memory-recall-feedback.jsonl';
const FEEDBACK_SIGNALS = new Set(['impression', 'useful']);

export function recallFeedbackPath(rootDir, env = process.env) {
  return path.join(
    resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env }),
    'telemetry',
    RECALL_FEEDBACK_FILE,
  );
}

export async function recordMemoRecallFeedback({
  workspaceRoot,
  eventIds = [],
  query = '',
  sessionId = '',
  agent = '',
  signal = 'impression',
  env = process.env,
} = {}) {
  const normalizedSignal = FEEDBACK_SIGNALS.has(signal) ? signal : '';
  if (!workspaceRoot || !normalizedSignal) return { status: 'skipped', reason: 'missing-root-or-signal', recorded: 0 };
  const ids = [...new Set((Array.isArray(eventIds) ? eventIds : [eventIds])
    .map((id) => String(id || '').trim())
    .filter(Boolean))]
    .slice(0, 32);
  if (ids.length === 0) return { status: 'skipped', reason: 'no-event-ids', recorded: 0 };
  const row = {
    schemaVersion: 1,
    kind: 'aios.memory-recall-feedback',
    at: new Date().toISOString(),
    signal: normalizedSignal,
    query: String(query || '').slice(0, 300),
    sessionId: String(sessionId || '').slice(0, 120),
    agent: String(agent || '').toLowerCase().slice(0, 60),
  };
  try {
    await appendText(recallFeedbackPath(workspaceRoot, env), `${ids.map((eventId) => `${JSON.stringify({ ...row, eventId })}\n`).join('')}`);
  } catch {
    return { status: 'error', reason: 'write-failed', recorded: 0 };
  }
  return { status: 'recorded', recorded: ids.length, signal: normalizedSignal };
}

export async function readMemoFeedbackScores({ workspaceRoot, env = process.env } = {}) {
  const { readJsonlEvents } = await import('./events-read.mjs');
  const empty = new Map();
  if (!workspaceRoot) return empty;
  try {
    const { events } = await readJsonlEvents(recallFeedbackPath(workspaceRoot, env), { tolerateMalformed: true });
    const scores = new Map();
    for (const row of events) {
      if (row?.kind !== 'aios.memory-recall-feedback' || !row.eventId) continue;
      const entry = scores.get(row.eventId) || { impressions: 0, useful: 0 };
      if (row.signal === 'useful') entry.useful += 1;
      else if (row.signal === 'impression') entry.impressions += 1;
      scores.set(row.eventId, entry);
    }
    return scores;
  } catch {
    return empty;
  }
}

/* Score adjustment contract (kept small and explainable):
 * - useful marks add trust: +1.5 each, capped so one hot memory cannot drown
 *   genuinely better keyword matches.
 * - repeatedly surfaced but never adopted memories decay: after 5 impressions
 *   with zero useful marks the score is scaled down — recall keeps finding
 *   them, nobody keeps using them, so they should stop crowding the budget.
 */
export function applyMemoFeedbackBoost(baseScore, feedback) {
  let score = baseScore;
  if (feedback?.useful > 0) score += Math.min(feedback.useful * 1.5, 4.5);
  if (feedback?.impressions >= 5 && !(feedback?.useful > 0)) score *= 0.6;
  return score;
}
