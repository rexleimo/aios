import { normalizeText } from './shared.mjs';

const DEFAULT_WORK_ITEM_LIMIT = 4;
const WORK_ITEM_TYPE_PATTERNS = Object.freeze([
  { type: 'auth', pattern: /\b(auth|authentication|authorize|authorization|login|oauth|token|credential|secret)\b/i },
  { type: 'payment', pattern: /\b(payment|billing|invoice|charge|refund|payout|stripe|paypal|card)\b/i },
  { type: 'security', pattern: /\b(security|vulnerability|xss|csrf|injection|permissions|policy|compliance|privacy)\b/i },
  { type: 'testing', pattern: /\b(test|testing|qa|verification|assert|regression)\b/i },
  { type: 'docs', pattern: /\b(doc|docs|documentation|readme|runbook|guide)\b/i },
  { type: 'refactor', pattern: /\b(refactor|cleanup|rename|extract|decompose|modularize)\b/i },
]);
const WORK_ITEM_OWNERSHIP_HINT_PATTERNS = Object.freeze([
  { pattern: /\bdocs?\b|\breadme\b|\brunbook\b|\bguide\b/i, hints: ['docs/'] },
  { pattern: /\btest|testing|qa|verification|assert|regression\b/i, hints: ['scripts/tests/'] },
  { pattern: /\bmcp-server\b/i, hints: ['mcp-server/src/'] },
  { pattern: /\bspec|schema\b/i, hints: ['scripts/lib/specs/'] },
]);

// 纯函数集合：负责 work item 拆解和路径归属提示，避免编排计划和执行计划混在一起。
export function normalizePathHint(value) {
  return normalizeText(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

export function normalizeOwnedPathHints(rawHints = []) {
  if (!Array.isArray(rawHints)) {
    return [];
  }

  const hints = [];
  const seen = new Set();
  for (const rawHint of rawHints) {
    let candidate = normalizeText(rawHint)
      .replace(/^[`"'([{<]+/, '')
      .replace(/[`"')\]}>.,;:!?]+$/, '');
    if (!candidate || /^[a-z]+:\/\//i.test(candidate)) {
      continue;
    }
    const normalized = normalizePathHint(candidate);
    if (!normalized || normalized.startsWith('../') || normalized.startsWith('~/') || /^[a-z]:\//i.test(normalized)) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    hints.push(normalized);
  }
  return hints;
}

export function extractOwnedPathHintsFromSummary(summary = '') {
  const tokens = normalizeText(summary).split(/\s+/).filter(Boolean);
  const rawHints = [];
  for (const token of tokens) {
    if (!/[\\/]/.test(token)) {
      continue;
    }
    rawHints.push(token);
  }
  return normalizeOwnedPathHints(rawHints);
}

export function inferOwnedPathHints(summary = '', type = 'general') {
  const explicitHints = extractOwnedPathHintsFromSummary(summary);
  if (explicitHints.length > 0) {
    return explicitHints;
  }

  const hints = [];
  const typeLabel = normalizeText(type).toLowerCase();
  if (typeLabel === 'docs') {
    hints.push('docs/');
  } else if (typeLabel === 'testing') {
    hints.push('scripts/tests/');
  } else {
    hints.push('scripts/', 'mcp-server/', 'docs/');
  }
  for (const entry of WORK_ITEM_OWNERSHIP_HINT_PATTERNS) {
    if (entry.pattern.test(summary)) {
      hints.push(...entry.hints);
    }
  }

  return normalizeOwnedPathHints(hints);
}

export function inferWorkItemType(text = '') {
  const sample = normalizeText(text);
  if (!sample) {
    return 'general';
  }
  for (const entry of WORK_ITEM_TYPE_PATTERNS) {
    if (entry.pattern.test(sample)) {
      return entry.type;
    }
  }
  return 'general';
}

export function normalizeWorkItem(rawItem = {}, index = 0) {
  const fallbackId = `wi.${index + 1}`;
  const itemId = normalizeText(rawItem.itemId) || fallbackId;
  const summary = normalizeText(rawItem.summary) || normalizeText(rawItem.title) || `Work item ${index + 1}`;
  const typeSeed = `${normalizeText(rawItem.type)} ${summary}`.trim();
  const type = inferWorkItemType(typeSeed);
  const title = normalizeText(rawItem.title)
    || (summary.length > 72 ? `${summary.slice(0, 71)}...` : summary);

  return {
    itemId,
    type,
    title,
    summary,
    source: normalizeText(rawItem.source) || 'decomposer-mvp',
    status: normalizeText(rawItem.status).toLowerCase() || 'queued',
    dependsOn: Array.isArray(rawItem.dependsOn)
      ? rawItem.dependsOn.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    ownedPathHints: normalizeOwnedPathHints(rawItem.ownedPathHints),
  };
}

export function normalizeWorkItems(rawItems = [], fallback = []) {
  const sourceItems = Array.isArray(rawItems) && rawItems.length > 0 ? rawItems : fallback;
  if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
    return [];
  }

  const normalized = [];
  const seen = new Set();
  for (const [index, rawItem] of sourceItems.entries()) {
    const item = normalizeWorkItem(rawItem, index);
    if (!item.itemId) {
      continue;
    }
    let resolvedId = item.itemId;
    let suffix = 2;
    while (seen.has(resolvedId)) {
      resolvedId = `${item.itemId}-${suffix}`;
      suffix += 1;
    }
    seen.add(resolvedId);
    normalized.push({
      ...item,
      itemId: resolvedId,
      dependsOn: item.dependsOn.filter((depId) => depId !== resolvedId),
    });
  }

  return normalized;
}

export function splitWorkItemCandidates(contextSummary = '') {
  const raw = String(contextSummary || '').replace(/\r/g, '\n');
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const candidates = [];

  for (const line of lines) {
    const bulletMatch = /^[-*+]\s+(.+)$/.exec(line) || /^\d+[.)]\s+(.+)$/.exec(line);
    const normalizedLine = bulletMatch ? bulletMatch[1].trim() : line;
    const segments = normalizedLine.split(/[\u003b\uff1b]+/u).map((segment) => normalizeText(segment)).filter(Boolean);
    candidates.push(...segments);
  }

  return candidates;
}

export function buildWorkItemFallback(taskTitle = '', contextSummary = '') {
  const summary = normalizeText(taskTitle) || normalizeText(contextSummary) || 'Deliver the orchestration task safely.';
  const type = inferWorkItemType(summary);
  return [{
    itemId: 'wi.1',
    title: summary.length > 72 ? `${summary.slice(0, 71)}...` : summary,
    summary,
    type,
    source: 'task-fallback',
    status: 'queued',
    dependsOn: [],
    ownedPathHints: inferOwnedPathHints(summary, type),
  }];
}

export function buildDecomposedWorkItems({ taskTitle = '', contextSummary = '', limit = DEFAULT_WORK_ITEM_LIMIT } = {}) {
  const maxItems = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_WORK_ITEM_LIMIT;
  const candidates = splitWorkItemCandidates(contextSummary);
  const deduped = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
    if (deduped.length >= maxItems) break;
  }

  if (deduped.length === 0) {
    return normalizeWorkItems([], buildWorkItemFallback(taskTitle, contextSummary));
  }

  const defaultHints = normalizeOwnedPathHints(['scripts/', 'mcp-server/']);
  const items = deduped.map((summary, index) => {
    const type = inferWorkItemType(summary);
    const hints = inferOwnedPathHints(summary, type);
    return {
      itemId: `wi.${index + 1}`,
      title: summary.length > 72 ? `${summary.slice(0, 71)}...` : summary,
      summary,
      type,
      source: 'planner-context',
      status: 'queued',
      dependsOn: [],
      ownedPathHints: hints.length > 0 ? hints : defaultHints,
    };
  });

  return normalizeWorkItems(items);
}
