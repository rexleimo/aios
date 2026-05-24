/* 中文注释：release 历史模块只负责窗口统计、按天聚合和导出格式，不处理 CLI IO。 */
import { normalizeText } from './shared.mjs';
import {
  HISTORY_TREND_FAILURE_DELTA_WARN,
  HISTORY_TREND_FALLBACK_DELTA_WARN,
} from './constants.mjs';

// 纯函数：把单条策略结果压缩成短趋势 token，便于文本报告横向展示。
export function toTrendToken(entry = {}) {
  if (entry.policy_applied !== true) return 'B';
  if (entry.policy_fallback === true) return 'PF';
  if (entry.failed === true) return 'F';
  if (entry.success === true) return 'S';
  return 'P';
}

// 纯函数：统计最近 N 条策略记录，输出健康判断所需的比例指标。
export function buildRecentSummary(entries = []) {
  const summary = {
    total: entries.length,
    policyApplied: 0,
    policyFallback: 0,
    success: 0,
    failed: 0,
    successRate: null,
    failureRate: null,
    fallbackRate: null,
    policyApplyRate: null,
    trend: [],
  };

  for (const entry of entries) {
    if (entry?.policy_applied === true) summary.policyApplied += 1;
    if (entry?.policy_fallback === true) summary.policyFallback += 1;
    if (entry?.success === true) summary.success += 1;
    if (entry?.failed === true) summary.failed += 1;
    summary.trend.push(toTrendToken(entry));
  }

  const outcomes = summary.success + summary.failed;
  if (outcomes > 0) {
    summary.successRate = summary.success / outcomes;
    summary.failureRate = summary.failed / outcomes;
  }
  if (summary.total > 0) {
    summary.fallbackRate = summary.policyFallback / summary.total;
    summary.policyApplyRate = summary.policyApplied / summary.total;
  }

  return summary;
}

function toDayKey(rawTimestamp = '') {
  const normalized = normalizeText(rawTimestamp);
  if (!normalized) return '';
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function shiftDayKey(dayKey = '', offsetDays = 0) {
  const normalized = normalizeText(dayKey);
  if (!normalized) return '';
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return '';
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString().slice(0, 10);
}

// 纯函数：按 UTC 日期聚合策略记录，并补充周同比 delta。
export function buildDailyHistory(entries = [], historyDays = 14) {
  const dayMap = new Map();
  for (const entry of entries) {
    const day = toDayKey(entry?.timestamp);
    if (!day) continue;

    const current = dayMap.get(day) || {
      date: day,
      samples: 0,
      policyApplied: 0,
      policyFallback: 0,
      success: 0,
      failed: 0,
      successRate: null,
      failureRate: null,
      fallbackRate: null,
      policyApplyRate: null,
    };
    current.samples += 1;
    if (entry?.policy_applied === true) current.policyApplied += 1;
    if (entry?.policy_fallback === true) current.policyFallback += 1;
    if (entry?.success === true) current.success += 1;
    if (entry?.failed === true) current.failed += 1;
    dayMap.set(day, current);
  }

  let days = [...dayMap.values()].sort((left, right) => left.date.localeCompare(right.date));
  if (historyDays > 0 && days.length > historyDays) {
    days = days.slice(-historyDays);
  }

  for (const day of days) {
    const outcomes = day.success + day.failed;
    if (outcomes > 0) {
      day.successRate = day.success / outcomes;
      day.failureRate = day.failed / outcomes;
    }
    if (day.samples > 0) {
      day.fallbackRate = day.policyFallback / day.samples;
      day.policyApplyRate = day.policyApplied / day.samples;
    }
  }

  const dayByDate = new Map(days.map((item) => [item.date, item]));
  for (const day of days) {
    const prevWeek = dayByDate.get(shiftDayKey(day.date, -7));
    day.wowSamplesDelta = prevWeek ? (day.samples - prevWeek.samples) : null;
    day.wowFailureRateDelta = prevWeek && Number.isFinite(day.failureRate) && Number.isFinite(prevWeek.failureRate)
      ? (day.failureRate - prevWeek.failureRate)
      : null;
    day.wowFallbackRateDelta = prevWeek && Number.isFinite(day.fallbackRate) && Number.isFinite(prevWeek.fallbackRate)
      ? (day.fallbackRate - prevWeek.fallbackRate)
      : null;
  }

  return {
    daysRequested: historyDays,
    totalDays: days.length,
    entries: days,
  };
}

// 纯函数：从日聚合中提取最新一天的阈值告警。
export function buildHistorySignals({
  historyDaily = {},
  maxFailureRate = 0.2,
  maxFallbackRate = 0.1,
  failureDeltaWarn = HISTORY_TREND_FAILURE_DELTA_WARN,
  fallbackDeltaWarn = HISTORY_TREND_FALLBACK_DELTA_WARN,
} = {}) {
  const entries = Array.isArray(historyDaily.entries) ? historyDaily.entries : [];
  const latest = entries.at(-1) || null;
  const previousWeekDate = latest ? shiftDayKey(latest.date, -7) : '';
  const previousWeek = previousWeekDate
    ? entries.find((item) => item.date === previousWeekDate) || null
    : null;
  const alerts = [];

  if (latest && Number.isFinite(latest.failureRate) && latest.failureRate > maxFailureRate) {
    alerts.push(`latest_failure_rate_exceeded(${latest.failureRate.toFixed(4)}>${maxFailureRate.toFixed(4)})`);
  }
  if (latest && Number.isFinite(latest.fallbackRate) && latest.fallbackRate > maxFallbackRate) {
    alerts.push(`latest_fallback_rate_exceeded(${latest.fallbackRate.toFixed(4)}>${maxFallbackRate.toFixed(4)})`);
  }
  if (latest && Number.isFinite(latest.wowFailureRateDelta) && latest.wowFailureRateDelta > failureDeltaWarn) {
    alerts.push(`wow_failure_rate_delta_exceeded(${latest.wowFailureRateDelta.toFixed(4)}>${failureDeltaWarn.toFixed(4)})`);
  }
  if (latest && Number.isFinite(latest.wowFallbackRateDelta) && latest.wowFallbackRateDelta > fallbackDeltaWarn) {
    alerts.push(`wow_fallback_rate_delta_exceeded(${latest.wowFallbackRateDelta.toFixed(4)}>${fallbackDeltaWarn.toFixed(4)})`);
  }

  return {
    latestDate: latest?.date || null,
    previousWeekDate: previousWeek?.date || null,
    hasAlert: alerts.length > 0,
    alerts,
    thresholds: {
      maxFailureRate,
      maxFallbackRate,
      wowFailureRateDeltaWarn: failureDeltaWarn,
      wowFallbackRateDeltaWarn: fallbackDeltaWarn,
    },
    metrics: {
      latestSamples: latest?.samples ?? null,
      latestFailureRate: Number.isFinite(latest?.failureRate) ? latest.failureRate : null,
      latestFallbackRate: Number.isFinite(latest?.fallbackRate) ? latest.fallbackRate : null,
      wowSamplesDelta: Number.isFinite(latest?.wowSamplesDelta) ? latest.wowSamplesDelta : null,
      wowFailureRateDelta: Number.isFinite(latest?.wowFailureRateDelta) ? latest.wowFailureRateDelta : null,
      wowFallbackRateDelta: Number.isFinite(latest?.wowFallbackRateDelta) ? latest.wowFallbackRateDelta : null,
    },
  };
}

function formatRateValue(value, digits = 6) {
  if (!Number.isFinite(value)) return '';
  return Number(value).toFixed(digits);
}

function renderHistoryCsv(history = {}) {
  const lines = [
    'date,samples,policy_applied,policy_fallback,success,failed,success_rate,failure_rate,fallback_rate,policy_apply_rate,wow_samples_delta,wow_failure_rate_delta,wow_fallback_rate_delta',
  ];
  for (const entry of Array.isArray(history.entries) ? history.entries : []) {
    lines.push([
      entry.date,
      entry.samples,
      entry.policyApplied,
      entry.policyFallback,
      entry.success,
      entry.failed,
      formatRateValue(entry.successRate),
      formatRateValue(entry.failureRate),
      formatRateValue(entry.fallbackRate),
      formatRateValue(entry.policyApplyRate),
      Number.isFinite(entry.wowSamplesDelta) ? String(entry.wowSamplesDelta) : '',
      formatRateValue(entry.wowFailureRateDelta),
      formatRateValue(entry.wowFallbackRateDelta),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}

function renderHistoryNdjson(history = {}) {
  const lines = [];
  for (const entry of Array.isArray(history.entries) ? history.entries : []) {
    lines.push(JSON.stringify(entry));
  }
  return `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`;
}

export function renderHistoryExport(history = {}, format = 'csv') {
  return format === 'ndjson' ? renderHistoryNdjson(history) : renderHistoryCsv(history);
}
