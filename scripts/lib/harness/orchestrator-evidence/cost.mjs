/* 中文注释：dispatch 成本归一化独立处理，避免事件文本和 checkpoint 参数各算一遍。 */
export function normalizeDispatchCost(raw = {}) {
  const inputTokens = Number.isFinite(raw?.inputTokens) ? Math.max(0, Math.floor(raw.inputTokens)) : 0;
  const outputTokens = Number.isFinite(raw?.outputTokens) ? Math.max(0, Math.floor(raw.outputTokens)) : 0;
  let totalTokens = Number.isFinite(raw?.totalTokens) ? Math.max(0, Math.floor(raw.totalTokens)) : 0;
  const usd = Number.isFinite(raw?.usd) ? Math.max(0, Number(raw.usd)) : 0;
  if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
    totalTokens = inputTokens + outputTokens;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usd: Number(usd.toFixed(4)),
  };
}

export function hasDispatchCost(raw = {}) {
  const cost = normalizeDispatchCost(raw);
  return cost.inputTokens > 0 || cost.outputTokens > 0 || cost.totalTokens > 0 || cost.usd > 0;
}

export function formatDispatchCostForEvent(raw = {}) {
  const cost = normalizeDispatchCost(raw);
  const parts = [];
  if (cost.totalTokens > 0) parts.push(`tokens=${cost.totalTokens}`);
  if (cost.usd > 0) parts.push(`usd=${cost.usd}`);
  return parts.join(' ');
}
