export function isReleaseStateUnavailable(result = {}) {
  return result?.ok === false && /state file not found/i.test(String(result?.error || ''));
}

// 纯函数：解析正整数环境变量，集中处理空值、非法值和向下取整。
export function parsePositiveIntegerEnv(rawValue, fallback, envName) {
  const text = String(rawValue ?? '').trim();
  if (!text) return fallback;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }
  return Math.floor(parsed);
}

// 纯函数：解析 0..1 的比例阈值，避免 release gate 分支各自校验。
export function parseRateEnv(rawValue, fallback, envName) {
  const text = String(rawValue ?? '').trim();
  if (!text) return fallback;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${envName} must be a number between 0 and 1`);
  }
  return parsed;
}

export function resolveReleaseGateThresholds(env = process.env) {
  const minSamplesRaw = env?.AIOS_RELEASE_GATE_MIN_SAMPLES ?? env?.AIOS_RELEASE_MIN_SAMPLES;
  const maxFailureRateRaw = env?.AIOS_RELEASE_GATE_MAX_FAILURE_RATE ?? env?.AIOS_RELEASE_MAX_FAILURE_RATE;
  const maxFallbackRateRaw = env?.AIOS_RELEASE_GATE_MAX_FALLBACK_RATE ?? env?.AIOS_RELEASE_MAX_FALLBACK_RATE;
  const minSamples = parsePositiveIntegerEnv(minSamplesRaw, 8, 'AIOS_RELEASE_GATE_MIN_SAMPLES');
  const maxFailureRate = parseRateEnv(maxFailureRateRaw, 0.2, 'AIOS_RELEASE_GATE_MAX_FAILURE_RATE');
  const maxFallbackRate = parseRateEnv(maxFallbackRateRaw, 0.1, 'AIOS_RELEASE_GATE_MAX_FALLBACK_RATE');
  return {
    minSamples,
    maxFailureRate,
    maxFallbackRate,
  };
}