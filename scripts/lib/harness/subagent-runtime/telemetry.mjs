export function parseNonNegativeInt(raw, fallback) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseNonNegativeNumber(raw, fallback = 0) {
  const value = Number.parseFloat(String(raw ?? '').trim());
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// 纯函数：统一补齐 token/cost 结构，避免调用方重复处理缺省值。
export function normalizeCostTelemetry(raw = {}) {
  const inputTokens = parseNonNegativeInt(raw?.inputTokens, 0);
  const outputTokens = parseNonNegativeInt(raw?.outputTokens, 0);
  let totalTokens = parseNonNegativeInt(raw?.totalTokens, 0);
  const usd = parseNonNegativeNumber(raw?.usd, 0);
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

export function hasCostTelemetry(raw = {}) {
  const cost = normalizeCostTelemetry(raw);
  return cost.inputTokens > 0 || cost.outputTokens > 0 || cost.totalTokens > 0 || cost.usd > 0;
}

export function mergeCostTelemetry(base = {}, next = {}) {
  const left = normalizeCostTelemetry(base);
  const right = normalizeCostTelemetry(next);
  return normalizeCostTelemetry({
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    usd: left.usd + right.usd,
  });
}

function pickFirstMatch(text, patterns = [], parser = Number.parseInt) {
  const source = String(text || '');
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match || !match[1]) continue;
    const value = parser(String(match[1]).trim(), 10);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return 0;
}

function collectCostTelemetryFromText(rawText = '') {
  const text = String(rawText || '');
  return normalizeCostTelemetry({
    inputTokens: pickFirstMatch(text, [
      /\binput[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
      /\bprompt[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
    ], Number.parseInt),
    outputTokens: pickFirstMatch(text, [
      /\boutput[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
      /\bcompletion[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
    ], Number.parseInt),
    totalTokens: pickFirstMatch(text, [
      /\btotal[\s_-]*tokens?\b\s*[:=]\s*(\d+)\b/i,
    ], Number.parseInt),
    usd: pickFirstMatch(text, [
      /\busd\b\s*[:=]\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\b/i,
      /\bcost\b\s*[:=]\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\b/i,
    ], Number.parseFloat),
  });
}

function readUsageShape(source = {}) {
  if (!source || typeof source !== 'object') {
    return normalizeCostTelemetry();
  }
  return normalizeCostTelemetry({
    inputTokens: source.inputTokens ?? source.input_tokens ?? source.promptTokens ?? source.prompt_tokens,
    outputTokens: source.outputTokens ?? source.output_tokens ?? source.completionTokens ?? source.completion_tokens,
    totalTokens: source.totalTokens ?? source.total_tokens,
    usd: source.usd,
  });
}

function collectCostTelemetryFromJson(rawJson = null) {
  if (!rawJson || typeof rawJson !== 'object') {
    return normalizeCostTelemetry();
  }

  const usageCandidates = [
    rawJson,
    rawJson.usage,
    rawJson.usageMetadata,
    rawJson.tokenUsage,
    rawJson.metrics?.usage,
    rawJson.cost,
  ];

  let combined = normalizeCostTelemetry();
  for (const candidate of usageCandidates) {
    const next = readUsageShape(candidate);
    combined = normalizeCostTelemetry({
      inputTokens: Math.max(combined.inputTokens, next.inputTokens),
      outputTokens: Math.max(combined.outputTokens, next.outputTokens),
      totalTokens: Math.max(combined.totalTokens, next.totalTokens),
      usd: Math.max(combined.usd, next.usd),
    });
  }

  if (combined.usd === 0 && Number.isFinite(rawJson.costUsd)) {
    combined = normalizeCostTelemetry({
      ...combined,
      usd: Math.max(combined.usd, parseNonNegativeNumber(rawJson.costUsd, 0)),
    });
  }
  return combined;
}

export function collectCostTelemetry({ rawText = '', rawJson = null } = {}) {
  const fromText = collectCostTelemetryFromText(rawText);
  const fromJson = collectCostTelemetryFromJson(rawJson);
  return normalizeCostTelemetry({
    inputTokens: Math.max(fromText.inputTokens, fromJson.inputTokens),
    outputTokens: Math.max(fromText.outputTokens, fromJson.outputTokens),
    totalTokens: Math.max(fromText.totalTokens, fromJson.totalTokens),
    usd: Math.max(fromText.usd, fromJson.usd),
  });
}
