/* 中文注释：release-status 渲染模块只把报告对象转成文本，不读写文件。 */
import { formatRate, formatSignedRate, normalizeText } from './shared.mjs';

export function buildFailureResult(error, options, statePath) {
  return {
    ok: false,
    exitCode: 1,
    error: normalizeText(error),
    format: options.format,
    statePath,
    recent: options.recent,
    strict: options.strict === true,
    outputPath: options.outputPath || '',
    historyOutputPath: options.historyOutputPath || '',
    historyFormat: options.historyFormat || 'csv',
    historyDays: options.historyDays || 14,
  };
}

export function renderReleaseStatusText(report = {}) {
  if (!report.ok) {
    return [
      'Release gate status: unavailable',
      `- state_path: ${report.statePath || '(unknown)'}`,
      `- error: ${report.error || 'unknown error'}`,
      '',
    ].join('\n');
  }

  const counters = report.counters || {};
  const recentWindow = report.recentWindow || {};
  const health = report.health || {};
  const historySignals = report.historySignals || {};
  const trend = Array.isArray(recentWindow.trend) ? recentWindow.trend.join(' ') : '';

  const lines = [
    'Release gate status',
    `- state_path: ${report.statePath}`,
    `- updated_at: ${report.updatedAt || '(unknown)'}`,
    `- effective_mode: ${report.effectiveMode}`,
    `- effective_rollout_rate: ${Number(report.effectiveRolloutRate || 0).toFixed(4)} (${formatRate(report.effectiveRolloutRate)})`,
    `- counters: total=${counters.total || 0} policy_applied=${counters.policy_applied || 0} baseline_routed=${counters.baseline_routed || 0} policy_fallback=${counters.policy_fallback || 0} policy_success=${counters.policy_success || 0} policy_failure=${counters.policy_failure || 0}`,
    `- transitions: downgrades=${counters.downgrades || 0} promotions=${counters.promotions || 0}`,
    `- streaks: consecutive_policy_success=${counters.consecutive_policy_success || 0} consecutive_policy_failures=${counters.consecutive_policy_failures || 0}`,
    `- reasons: last_downgrade=${report.lastDowngradeReason || '(none)'} last_promotion=${report.lastPromotionReason || '(none)'}`,
    `- recent(${recentWindow.limit || 0}): samples=${recentWindow.total || 0} policy_applied=${recentWindow.policyApplied || 0} fallback=${recentWindow.policyFallback || 0} success=${recentWindow.success || 0} failed=${recentWindow.failed || 0} success_rate=${formatRate(recentWindow.successRate)} failure_rate=${formatRate(recentWindow.failureRate)} fallback_rate=${formatRate(recentWindow.fallbackRate)}`,
    `- health: status=${health.status || 'unknown'} gate_passed=${health.gatePassed === true ? 'yes' : 'no'} strict=${report.strict === true ? 'on' : 'off'}`,
    `- health thresholds: min_samples=${health.thresholds?.minSamples ?? 0} max_failure_rate=${health.thresholds?.maxFailureRate ?? 0} max_fallback_rate=${health.thresholds?.maxFallbackRate ?? 0}`,
    `- history: days=${report.historyDaily?.totalDays ?? 0}/${report.historyDays ?? 0} format=${report.historyFormat || 'csv'} output=${report.historyOutputPath || '(none)'}`,
    `- history trend: latest=${historySignals.latestDate || '(none)'} prev_week=${historySignals.previousWeekDate || '(none)'} wow_failure_delta=${formatSignedRate(historySignals.metrics?.wowFailureRateDelta)} wow_fallback_delta=${formatSignedRate(historySignals.metrics?.wowFallbackRateDelta)} alerts=${historySignals.hasAlert === true ? 'yes' : 'no'}`,
  ];
  if (Array.isArray(health.reasons) && health.reasons.length > 0) {
    lines.push(`- health reasons: ${health.reasons.join(', ')}`);
  }
  if (trend) {
    lines.push(`- trend: ${trend}`);
    lines.push('- trend legend: B=baseline PF=policy_fallback F=policy_failed S=policy_success');
  }
  if (Array.isArray(historySignals.alerts) && historySignals.alerts.length > 0) {
    lines.push(`- history alerts: ${historySignals.alerts.join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}
