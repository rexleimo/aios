// scripts/lib/clients/plugins/onUsage — 用量行聚合（P1）。
// onUsage 是每个请求结束后的只读通知：消费用量行，不影响请求本身。
// 纯函数：输入当前聚合 + 一行用量，输出新聚合；坏行跳过（fail-open）。

const USAGE_KEYS = Object.freeze(['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens']);

export function emptyUsageAggregate() {
  return Object.freeze({
    calls: 0,
    errors: 0,
    tokens: Object.freeze(Object.fromEntries(USAGE_KEYS.map((key) => [key, 0]))),
    byModel: Object.freeze({}),
  });
}

/**
 * 聚合一行的用量。行形状来自网关决策日志的 usage（已脱敏）。
 * @param {object} aggregate 当前聚合
 * @param {object} row {modelId,status,usage:{input_tokens,output_tokens,cached_tokens,cache_write_tokens}}
 */
export function aggregateUsageRow(aggregate, row) {
  if (!row || typeof row !== 'object') return aggregate;
  const tokens = { ...(aggregate.tokens || {}) };
  for (const key of USAGE_KEYS) tokens[key] = Number(tokens[key]) || 0;
  const usage = row.usage && typeof row.usage === 'object' ? row.usage : {};
  const read = Number(usage.input_tokens ?? usage.prompt_tokens) || 0;
  const write = Number(usage.output_tokens ?? usage.completion_tokens) || 0;
  const cached = Number(usage.cached_tokens ?? usage.cache_read_tokens ?? usage.prompt_tokens_details?.cached_tokens) || 0;
  const cacheWrite = Number(usage.cache_write_tokens ?? usage.prompt_tokens_details?.cache_write_tokens) || 0;
  tokens.input_tokens += read;
  tokens.output_tokens += write;
  tokens.cache_read_tokens += cached;
  tokens.cache_write_tokens += cacheWrite;
  const byModel = { ...(aggregate.byModel || {}) };
  const model = String(row.modelId || 'unknown');
  const prev = byModel[model] || { calls: 0, tokens: 0 };
  byModel[model] = { calls: prev.calls + 1, tokens: prev.tokens + read + write };
  return Object.freeze({
    calls: (Number(aggregate.calls) || 0) + 1,
    errors: (Number(aggregate.errors) || 0) + (Number(row.status) >= 400 || row.error ? 1 : 0),
    tokens: Object.freeze(tokens),
    byModel: Object.freeze(byModel),
  });
}

/** 缓存命中率 = cache_read / (input + cache_read)，无数据返回 0（诚实，不美化）。 */
export function cacheHitRate(aggregate) {
  const tokens = aggregate?.tokens || {};
  const read = Number(tokens.input_tokens) || 0;
  const cached = Number(tokens.cache_read_tokens) || 0;
  const total = read + cached;
  return total > 0 ? cached / total : 0;
}
