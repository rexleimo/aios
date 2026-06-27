/* 中文注释：worker_died 死亡通知协议 — 纯文件通知 + 去重，不做恢复调度。 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveContextDbRoot } from '../aios/state-root.mjs';

const DEATH_NOTICES_FILENAME = 'death-notices.jsonl';

export const VALID_DEATH_REASONS = Object.freeze([
  'timeout',
  'crash',
  'zombie',
  'manual_kill',
]);

/**
 * Build a structured worker_died death notice object.
 *
 * @param {{ agentId: string, sessionId: string, reason: string, lastKnownState?: object, timestamp?: string }} params
 * @returns {{ type: string, agent_id: string, session_id: string, reason: string, last_known_state: object, timestamp: string, dedup_key: string }}
 */
export function buildDeathNotice({ agentId, sessionId, reason, lastKnownState = {}, timestamp } = {}) {
  const normalizedAgentId = String(agentId ?? '').trim();
  const normalizedSessionId = String(sessionId ?? '').trim();
  const normalizedReason = String(reason ?? '').trim().toLowerCase();

  if (!normalizedAgentId) throw new Error('buildDeathNotice: agentId is required');
  if (!normalizedSessionId) throw new Error('buildDeathNotice: sessionId is required');
  if (!VALID_DEATH_REASONS.includes(normalizedReason)) {
    throw new Error(`buildDeathNotice: reason must be one of ${VALID_DEATH_REASONS.join('|')}, got "${normalizedReason}"`);
  }

  const normalizedTimestamp = timestamp || new Date().toISOString();
  const dedupKey = computeDedupKey(normalizedAgentId, normalizedSessionId);

  return {
    type: 'worker_died',
    agent_id: normalizedAgentId,
    session_id: normalizedSessionId,
    reason: normalizedReason,
    last_known_state: lastKnownState || {},
    timestamp: normalizedTimestamp,
    dedup_key: dedupKey,
  };
}

/**
 * Compute a dedup key from agentId + sessionId (SHA-256 truncated to 16 hex chars).
 */
export function computeDedupKey(agentId, sessionId) {
  const raw = `${agentId}:${sessionId}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  return hash.slice(0, 16);
}

/**
 * Resolve the directory where death notices are stored for a given session.
 * Path: <contextDbRoot>/sessions/<sessionId>/death-notices.jsonl
 */
export function resolveDeathNoticesPath(rootDir, sessionId) {
  const contextDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  return path.join(contextDbRoot, 'sessions', sessionId, DEATH_NOTICES_FILENAME);
}

/**
 * Write (append) a death notice to the session's JSONL file.
 * Creates parent directories if they don't exist.
 *
 * @param {string} rootDir — workspace root
 * @param {object} notice — the notice object returned by buildDeathNotice
 * @returns {string} the absolute path written to
 */
export async function writeDeathNotice(rootDir, notice) {
  if (!notice || typeof notice !== 'object' || notice.type !== 'worker_died') {
    throw new Error('writeDeathNotice: notice must be a worker_died notice object');
  }
  const filePath = resolveDeathNoticesPath(rootDir, notice.session_id);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const line = JSON.stringify(notice) + '\n';
  await fs.appendFile(filePath, line, 'utf8');
  return filePath;
}

/**
 * Read all death notices for a given session.
 * Returns an empty array if the file doesn't exist or is unreadable.
 *
 * @param {string} rootDir — workspace root
 * @param {string} sessionId
 * @returns {object[]} array of parsed notice objects
 */
export async function readDeathNotices(rootDir, sessionId) {
  const normalizedSessionId = String(sessionId ?? '').trim();
  if (!normalizedSessionId) return [];
  const filePath = resolveDeathNoticesPath(rootDir, normalizedSessionId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.split('\n').filter((line) => line.trim() !== '');
    const notices = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && parsed.type === 'worker_died') notices.push(parsed);
      } catch {
        /* 中文注释：跳过无法解析的行，保持健壮性。 */
      }
    }
    return notices;
  } catch {
    return [];
  }
}

/**
 * Check whether a notice with the same dedup_key already exists in the list.
 *
 * @param {object[]} existingNotices — array of notice objects (from readDeathNotices)
 * @param {object} notice — candidate notice (from buildDeathNotice)
 * @returns {boolean} true if a duplicate exists
 */
export function hasDuplicateNotice(existingNotices, notice) {
  if (!Array.isArray(existingNotices) || !notice || !notice.dedup_key) return false;
  return existingNotices.some((existing) => existing.dedup_key === notice.dedup_key);
}
