/* 中文注释：release 健康判断只消费 recentWindow 指标，不关心状态文件来源。 */
export function buildHealthSummary({
  recentWindow = {},
  minSamples = 8,
  maxFailureRate = 0.2,
  maxFallbackRate = 0.1,
} = {}) {
  const reasons = [];
  const sampleCount = Number(recentWindow.total || 0);
  const failureRate = Number.isFinite(recentWindow.failureRate) ? recentWindow.failureRate : null;
  const fallbackRate = Number.isFinite(recentWindow.fallbackRate) ? recentWindow.fallbackRate : null;

  if (sampleCount < minSamples) {
    reasons.push(`insufficient_samples(${sampleCount}/${minSamples})`);
  }
  if (!Number.isFinite(failureRate)) {
    reasons.push('failure_rate_unavailable');
  } else if (failureRate > maxFailureRate) {
    reasons.push(`failure_rate_exceeded(${failureRate.toFixed(4)}>${maxFailureRate.toFixed(4)})`);
  }
  if (!Number.isFinite(fallbackRate)) {
    reasons.push('fallback_rate_unavailable');
  } else if (fallbackRate > maxFallbackRate) {
    reasons.push(`fallback_rate_exceeded(${fallbackRate.toFixed(4)}>${maxFallbackRate.toFixed(4)})`);
  }

  const gatePassed = reasons.length === 0;
  let status = 'healthy';
  if (!gatePassed) {
    const failureSevere = Number.isFinite(failureRate) && failureRate > (maxFailureRate * 1.5);
    const fallbackSevere = Number.isFinite(fallbackRate) && fallbackRate > (maxFallbackRate * 1.5);
    status = (failureSevere || fallbackSevere) ? 'critical' : 'warning';
  }

  return {
    status,
    gatePassed,
    reasons,
    thresholds: {
      minSamples,
      maxFailureRate,
      maxFallbackRate,
    },
    metrics: {
      samples: sampleCount,
      failureRate,
      fallbackRate,
    },
  };
}
