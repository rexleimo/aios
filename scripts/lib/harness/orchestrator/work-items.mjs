import { normalizeText } from './shared.mjs';

const DEFAULT_WORK_ITEM_LIMIT = 4;
const DEFAULT_OWNED_PATH_HINTS = Object.freeze(['scripts/', 'mcp-server/', 'docs/']);

// 纯函数集合：负责 work item 拆解和路径归属提示，避免编排计划和执行计划混在一起。
// 北极星原则：程序不做语义猜测。work item 类型与路径归属只来自显式声明
// （rawItem.type / task.type / plan targets+allowedWrites）或确定性提取
// （summary 中形如路径的 token）；语义判断上移给 LLM/显式声明。
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

export function inferOwnedPathHints(summary = '', _type = 'general') {
  const explicitHints = extractOwnedPathHintsFromSummary(summary);
  if (explicitHints.length > 0) {
    return explicitHints;
  }

  // 无显式路径声明时只返回宽泛默认，覆盖仓库主要源码目录；
  // 不按文本关键词猜测更精确的归属路径。
  return normalizeOwnedPathHints(DEFAULT_OWNED_PATH_HINTS);
}

export function inferWorkItemType(_text = '') {
  // 北极星原则：程序不根据文本关键词猜测任务类型，类型只来自显式声明
  // （rawItem.type / task.type），否则一律 neutral general。
  return 'general';
}

export function normalizeWorkItem(rawItem = {}, index = 0) {
  const fallbackId = `wi.${index + 1}`;
  const itemId = normalizeText(rawItem.itemId) || fallbackId;
  const summary = normalizeText(rawItem.summary) || normalizeText(rawItem.title) || `Work item ${index + 1}`;
  const type = normalizeText(rawItem.type) || inferWorkItemType(summary);
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
    acceptance: normalizeText(rawItem.acceptance),
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

/**
 * Map eligible structured-plan tasks (schema v3) to work items.
 * Dependencies, ownership (targets + allowedWrites), and acceptance come from
 * the plan itself instead of rule-based inference over a context string.
 */
export function buildPlanTaskWorkItems(planTasks = []) {
  const eligible = (Array.isArray(planTasks) ? planTasks : [])
    .filter((task) => task && !['done', 'skipped'].includes(String(task?.status || 'pending')))
    .map((task, index) => {
      const title = normalizeText(task?.title) || normalizeText(task?.id) || `Work item ${index + 1}`;
      return {
        itemId: normalizeText(task?.id) || `wi.${index + 1}`,
        title,
        summary: title,
        type: normalizeText(task?.type) || inferWorkItemType(title),
        source: 'active-plan',
        status: 'queued',
        dependsOn: Array.isArray(task?.dependsOn)
          ? task.dependsOn.map((item) => normalizeText(item)).filter(Boolean)
          : [],
        ownedPathHints: normalizeOwnedPathHints([
          ...(Array.isArray(task?.targets) ? task.targets : []),
          ...(Array.isArray(task?.allowedWrites) ? task.allowedWrites : []),
        ]),
        acceptance: normalizeText(task?.acceptance),
      };
    });
  return normalizeWorkItems(eligible);
}

export function buildDecomposedWorkItems({ taskTitle = '', contextSummary = '', limit = DEFAULT_WORK_ITEM_LIMIT, planTasks = null } = {}) {
  // Structured active-plan tasks are the authoritative decomposition source:
  // they carry explicit dependencies, ownership, and acceptance criteria.
  if (Array.isArray(planTasks)) {
    const planned = buildPlanTaskWorkItems(planTasks);
    if (planned.length >= 2) {
      return planned;
    }
  }

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
      ownedPathHints: hints,
    };
  });

  return normalizeWorkItems(items);
}
