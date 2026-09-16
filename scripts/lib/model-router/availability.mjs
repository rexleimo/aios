import fs from 'node:fs';
import path from 'node:path';

// 模型“通道可用性”状态机。
/* 中文注释：registry.json 只写能力（语义），可用性是运行时事实，两者必须分开——
   同一目录里静态打勾的 gpt-5.6-luna 实测 404，同族 gpt-5.6-sol 却能跑但 48s，
   所以任何写死的 ✓ 都是假账。状态存在 memory/specs/model-availability.json，
   带 TTL，过期即回落到 unknown（= 没证据，按未知处理并可重试），不是“永久坏”。 */

export const AVAILABILITY_STATES = Object.freeze(['ok', 'degraded', 'down']);

export const AVAILABILITY_DEFAULTS = Object.freeze({
  ttlMs: 10 * 60 * 1000,
  cooldownMs: 5 * 60 * 1000,
  downAfterConsecutiveFailures: 2,
  degradedLatencyMs: 20_000,
});

export const AVAILABILITY_CACHE_REL_PATH = 'memory/specs/model-availability.json';

// 通道级故障证据：SKU 没绑定、渠道没有可用上游、静默换模型、响应被截断。
/* 中文注释：这些不是“工具用错了”，也不是普通网络抖动——它们说明“这个模型在这条通道上
   今天不存在”。归成一类，路由层才能把它变成可重试的状态而不是永久事实。 */
export const CHANNEL_UNAVAILABLE_PATTERNS = Object.freeze([
  'model_not_found',
  'model not found',
  'invalid model',
  'unsupported model',
  'no available channel',
  'channel unavailable',
  'no_channel',
  'service_unavailable',
  'response was truncated',
  'engine is currently unavailable',
  'model is not available',
]);

// 网络类但非通道级：网关/隧道自身故障。
export const NETWORK_CHANNEL_PATTERNS = Object.freeze([
  '404 not found',
  'bad gateway',
  'service unavailable',
  'gateway time-out',
  'gateway timeout',
  'socket hang up',
]);

// 纯函数：把一段错误文本判成 'channel-unavailable' | 'network' | ''。
export function classifyChannelEvidence(detail = '') {
  const normalized = String(detail || '').toLowerCase();
  if (!normalized) return '';
  if (CHANNEL_UNAVAILABLE_PATTERNS.some((pattern) => normalized.includes(pattern))) return 'channel-unavailable';
  if (NETWORK_CHANNEL_PATTERNS.some((pattern) => normalized.includes(pattern))) return 'network';
  return '';
}

function nowValue(now) {
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  return Date.now();
}

function finiteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

// 纯函数：把一次探测结果折叠进该模型（或该模型在某协议通道下）的可用性记录。
export function applyProbeResult(previous, probe = {}, options = {}) {
  const limits = { ...AVAILABILITY_DEFAULTS, ...(options.limits || {}) };
  const now = nowValue(options.now ?? probe.observedAt);
  const prev = previous && typeof previous === 'object' ? previous : {};
  const record = {
    state: String(prev.state || 'unknown'),
    consecutiveFailures: Math.max(0, finiteNumber(prev.consecutiveFailures)),
    updates: Math.max(0, finiteNumber(prev.updates)),
    latencyMs: finiteNumber(prev.latencyMs),
    updatedAt: finiteNumber(prev.updatedAt),
    lastFailureAt: finiteNumber(prev.lastFailureAt),
    reason: String(prev.reason || ''),
    evidence: String(prev.evidence || ''),
    protocol: String(prev.protocol || ''),
  };
  const ok = probe.ok === true;
  const httpStatus = finiteNumber(probe.httpStatus) || 0;
  const latencyMs = Math.max(0, finiteNumber(probe.latencyMs));
  const requested = String(probe.modelId || '').trim();
  const served = String(probe.servedModelId || '').trim();
  const errorClass = String(probe.errorClass || '').trim();
  record.protocol = String(probe.protocol || record.protocol || '');
  record.updatedAt = now;
  record.updates += 1;
  if (latencyMs > 0) {
    // 简单 EMA（0.5 权重）：只用于展示与慢判定，不做统计结论。
    record.latencyMs = record.latencyMs > 0 ? Math.round(record.latencyMs * 0.5 + latencyMs * 0.5) : latencyMs;
  }

  if (!ok) {
    record.lastFailureAt = now;
    record.reason = errorClass || (httpStatus ? `http-${httpStatus}` : 'probe-failed');
    record.evidence = String(probe.evidence || record.evidence || '');
    // SKU 没绑定（404 / model_not_found）一次即可定论，不用等熔断阈值。
    const hardDown = httpStatus === 404 || record.reason.includes('model-not-found');
    record.consecutiveFailures = record.consecutiveFailures + 1;
    record.state = (hardDown || record.consecutiveFailures >= limits.downAfterConsecutiveFailures) ? 'down' : 'degraded';
    return record;
  }

  record.consecutiveFailures = 0;
  record.evidence = String(probe.evidence || record.evidence || '');
  if (served && requested && served !== requested) {
    // 静默换模型：请求 A 返回 B。不算失败，但必须降级并留痕，否则能力结论是假的。
    record.state = 'degraded';
    record.reason = `substituted:${served}`;
    return record;
  }
  if (record.latencyMs > limits.degradedLatencyMs) {
    record.state = 'degraded';
    record.reason = `slow:${record.latencyMs}ms`;
    return record;
  }
  record.state = 'ok';
  record.reason = '';
  return record;
}

// 纯函数：在给定时刻读取有效状态；TTL 过期或 down 过冷却期都回落到 unknown（允许再探）。
export function effectiveAvailability(record, options = {}) {
  const limits = { ...AVAILABILITY_DEFAULTS, ...(options.limits || {}) };
  const now = nowValue(options.now);
  if (!record || typeof record !== 'object') return { state: 'unknown', reason: 'no-evidence' };
  const updatedAt = finiteNumber(record.updatedAt);
  if (!updatedAt || now - updatedAt > limits.ttlMs) {
    return { state: 'unknown', reason: 'stale' };
  }
  const state = AVAILABILITY_STATES.includes(record.state) ? record.state : 'unknown';
  if (state === 'down') {
    const since = now - finiteNumber(record.lastFailureAt || record.updatedAt);
    if (since > limits.cooldownMs) return { state: 'unknown', reason: 'cooldown-expired' };
  }
  return { state, reason: String(record.reason || '') };
}

function availabilityPath(cwd = process.cwd(), env = process.env) {
  const override = String(env?.AIOS_MODEL_AVAILABILITY_PATH || '').trim();
  if (override) return path.resolve(cwd, override);
  return path.join(path.resolve(cwd), AVAILABILITY_CACHE_REL_PATH);
}

function readCacheFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// 读取本地可用性缓存；纯 IO，不联网。
export function loadModelAvailability(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const filePath = availabilityPath(cwd, env);
  const cache = readCacheFile(filePath);
  const records = cache?.models && typeof cache.models === 'object' ? cache.models : {};
  return { filePath, cache: { ...cache, models: records }, source: Object.keys(records).length ? 'cache' : 'empty' };
}

// 写入一次探测结果（模型 + 可选协议通道 组成 key，因为同一模型在不同协议通道可用性不同）。
export function recordModelAvailability(probe = {}, options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const { filePath, cache } = loadModelAvailability({ cwd, env });
  const modelId = String(probe.modelId || '').trim();
  if (!modelId) return { ok: false, reason: 'model-id-required' };
  const key = probe.protocol ? `${modelId}@${probe.protocol}` : modelId;
  const limits = { ...AVAILABILITY_DEFAULTS, ...(options.limits || {}) };
  const next = applyProbeResult(cache.models?.[key], probe, { now: options.now, limits });
  const models = { ...(cache.models || {}), [key]: next };
  const payload = {
    schemaVersion: 1,
    updatedAt: new Date(nowValue(options.now ?? Date.now())).toISOString(),
    source: 'probe',
    ttlMs: limits.ttlMs,
    models,
  };
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch {
    return { ok: false, reason: 'write-failed', key, state: next.state };
  }
  return { ok: true, key, filePath, state: next.state, reason: next.reason, record: next };
}

// 纯函数：查一个模型在当前时刻的有效可用性（先查 model@protocol 通道键，再查裸模型键）。
export function availabilityForModel(modelId, protocol = '', options = {}) {
  const models = options.availability?.models || {};
  const key = protocol ? `${modelId}@${protocol}` : '';
  const record = (key && models[key]) || models[String(modelId || '').trim()] || null;
  return effectiveAvailability(record, options);
}
