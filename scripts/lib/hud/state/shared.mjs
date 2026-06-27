export const DEFAULT_SESSION_SCAN_LIMIT = 200;
export const SKILL_CANDIDATE_ARTIFACT_FILE_PATTERN = /^skill-candidate-.*\.json$/i;
export const SKILL_CANDIDATE_ARTIFACT_KIND = 'learn-eval.skill-candidate';
export const DISPATCH_HINDSIGHT_FIX_HINT_ACTIONS = Object.freeze({
  'ownership-policy': 'runbook.dispatch-merge-triage',
  contract: 'runbook.dispatch-merge-triage',
  timeout: 'gate.timeout-budget',
  'dependency-blocked': 'runbook.failure-triage',
  'unsupported-job': 'runbook.tool-repair',
  'runtime-error': 'runbook.tool-repair',
  default: 'runbook.failure-triage',
});

export function nowIso() {
  return new Date().toISOString();
}

// 纯函数：把任意输入收敛为去空白字符串，避免 HUD 拼装层重复做空值判断。
export { normalizeText } from '../../../../src/shared/normalize.mjs';

// 纯函数：统一缓存键片段的转义规则，避免不同缓存模块生成不兼容 key。
export function getCacheKeyPart(value) {
  return String(value ?? '').replaceAll('::', ':');
}

// 纯函数：HUD 输出和快照都使用 POSIX 风格路径，保证 Windows/Linux 呈现一致。
export function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

// 纯函数：限制错误和证据文本长度，避免 HUD 状态被大日志撑爆。
export function clipText(value, maxLen = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

export function normalizeStringArray(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const values = [];
  for (const item of raw) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  return values;
}

export function compareIsoDesc(left = '', right = '') {
  return String(right || '').localeCompare(String(left || ''));
}

export function normalizeConcurrency(value, fallback = 8) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(32, Math.max(1, Math.floor(parsed)));
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const resolvedConcurrency = normalizeConcurrency(concurrency, 1);
  const results = new Array(items.length);
  let cursor = 0;

  const workerCount = Math.min(resolvedConcurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

export function bumpLruCache(cache, cacheKey) {
  if (!cacheKey || !(cache instanceof Map) || !cache.has(cacheKey)) return;
  const value = cache.get(cacheKey);
  cache.delete(cacheKey);
  cache.set(cacheKey, value);
}

export function setLruCache(cache, cacheKey, value, maxEntries) {
  if (!cacheKey || !(cache instanceof Map)) return;
  if (cache.has(cacheKey)) {
    cache.delete(cacheKey);
  }
  cache.set(cacheKey, value);
  const limit = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 50;
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}
