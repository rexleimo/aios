import {
  DEFAULT_MEMO_STORAGE,
  SUPPORTED_MEMO_STORAGES,
} from './constants.mjs';
import { sha256Hex } from './fs-io.mjs';
import { normalizeClaimStatus, normalizeStoredMemoProvenance } from './provenance.mjs';
import { normalizeIsoTimestamp, toSupersedeDenials, toSupersedes } from './temporal.mjs';

export function normalizeSpaceName(raw) {
  const value = String(raw || '').trim();
  return value || 'default';
}

export function sanitizeSpace(raw) {
  const original = normalizeSpaceName(raw);
  const normalized = original
    .toLowerCase()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized) return normalized;
  return `space-${sha256Hex(original).slice(0, 10)}`;
}

export function normalizeLimit(raw, fallback = 20) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function toRefs(refs = []) {
  if (!Array.isArray(refs)) return [];
  const output = [];
  const seen = new Set();
  for (const ref of refs) {
    const value = String(ref || '').replace(/^#+/u, '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

export function normalizeMemoScope(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/[-\s]+/gu, '_');
  if (!value || value === 'project' || value === 'shared' || value === 'global') return 'project_shared';
  if (value === 'private' || value === 'agent') return 'agent_private';
  if (['project_shared', 'agent_private', 'agent_ephemeral'].includes(value)) return value;
  throw new Error('memo scope must be one of: project_shared, agent_private, agent_ephemeral');
}

export function normalizeMemoAgent(raw) {
  return String(raw || '').trim().toLowerCase();
}

// 纯函数：兼容旧名称 stream/file-stream，并统一拒绝 sqlite 等缓存实现。
export function normalizeMemoStorageName(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'stream' || value === 'file-stream') return 'file';
  if (SUPPORTED_MEMO_STORAGES.includes(value)) return value;
  throw new Error(`storage must be one of: ${SUPPORTED_MEMO_STORAGES.join(', ')}`);
}

export function normalizeEventRows(events, { fallbackStorage = DEFAULT_MEMO_STORAGE } = {}) {
  return events
    .filter((event) => event && typeof event === 'object')
    .map((event) => {
      const space = normalizeSpaceName(event.space || event.spaceName || 'default');
      const spaceKey = event.spaceKey || sanitizeSpace(space);
      const ts = event.ts ? String(event.ts) : '';
      const provenance = normalizeStoredMemoProvenance(event.provenance);
      return {
        schemaVersion: Number.isFinite(event.schemaVersion) ? event.schemaVersion : 1,
        eventId: String(event.eventId || ''),
        storage: event.storage ? String(event.storage) : fallbackStorage,
        space,
        spaceKey,
        seq: Number.isFinite(event.seq) ? event.seq : undefined,
        ts: ts,
        role: event.role ? String(event.role) : 'user',
        kind: event.kind ? String(event.kind) : 'memo',
        text: event.text ? String(event.text) : '',
        refs: toRefs(event.refs || []),
        scope: normalizeMemoScope(event.scope || event.memoryScope || 'project_shared'),
        agent: normalizeMemoAgent(event.agent || event.agentNamespace || ''),
        claimStatus: normalizeClaimStatus(event.claimStatus, provenance),
        provenance,
        ...(event.promotionOf ? { promotionOf: String(event.promotionOf).trim() } : {}),
        validAt: normalizeIsoTimestamp(event.validAt) || normalizeIsoTimestamp(ts),
        supersedes: toSupersedes(event.supersedes),
        ...(toSupersedeDenials(event.supersedeDenied).length > 0
          ? { supersedeDenied: toSupersedeDenials(event.supersedeDenied) }
          : {}),
        turn: event.turn && typeof event.turn === 'object' ? event.turn : undefined,
        legacy: event.legacy && typeof event.legacy === 'object' ? event.legacy : undefined,
      };
    })
    .filter((event) => event.kind === 'memo' && event.text.trim());
}

export function sortEventsAscending(events) {
  return [...events].sort((a, b) => {
    const tsCompare = String(a.ts || '').localeCompare(String(b.ts || ''));
    if (tsCompare !== 0) return tsCompare;
    const seqCompare = Number(a.seq || 0) - Number(b.seq || 0);
    if (seqCompare !== 0) return seqCompare;
    return String(a.eventId || '').localeCompare(String(b.eventId || ''));
  });
}

export function sortEventsDescending(events) {
  return sortEventsAscending(events).reverse();
}
