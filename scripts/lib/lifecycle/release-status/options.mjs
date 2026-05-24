/* 中文注释：release-status 参数规划只做选项归一化和命令预览，不加载状态文件。 */
import path from 'node:path';

import {
  createDefaultReleaseStatusOptions,
  normalizeReleaseStatusHistoryFormat,
  normalizeReleaseStatusFormat,
} from '../options.mjs';
import { normalizePolicyReleaseConfig } from '../../rl-orchestrator-v1/policy-release-gate.mjs';
import {
  HISTORY_TREND_FAILURE_DELTA_WARN_ENV,
  HISTORY_TREND_FAILURE_DELTA_WARN_ENV_ALIAS,
  HISTORY_TREND_FALLBACK_DELTA_WARN_ENV,
  HISTORY_TREND_FALLBACK_DELTA_WARN_ENV_ALIAS,
} from './constants.mjs';
import {
  normalizeOutputPath,
  normalizeStatePath,
  parsePositiveInteger,
  parseRate,
  parseRateEnv,
  toPosixPath,
} from './shared.mjs';

export function normalizeReleaseStatusOptions(rawOptions = {}, { rootDir = process.cwd(), env = process.env } = {}) {
  const defaults = createDefaultReleaseStatusOptions();
  const defaultConfig = normalizePolicyReleaseConfig({ rootDir });
  const statePath = normalizeStatePath(
    rawOptions.statePath ?? defaults.statePath,
    rootDir,
    defaultConfig.state_path
  );
  const format = normalizeReleaseStatusFormat(rawOptions.format ?? defaults.format);
  const recent = parsePositiveInteger(rawOptions.recent, defaults.recent, '--recent');
  const strict = rawOptions.strict === true;
  const minSamples = parsePositiveInteger(rawOptions.minSamples, defaults.minSamples, '--min-samples');
  const maxFailureRate = parseRate(rawOptions.maxFailureRate, defaults.maxFailureRate, '--max-failure-rate');
  const maxFallbackRate = parseRate(rawOptions.maxFallbackRate, defaults.maxFallbackRate, '--max-fallback-rate');
  const wowFailureRateDeltaWarn = rawOptions.wowFailureRateDeltaWarn === undefined
    ? parseRateEnv(
      env?.[HISTORY_TREND_FAILURE_DELTA_WARN_ENV] ?? env?.[HISTORY_TREND_FAILURE_DELTA_WARN_ENV_ALIAS],
      defaults.wowFailureRateDeltaWarn,
      HISTORY_TREND_FAILURE_DELTA_WARN_ENV
    )
    : parseRate(rawOptions.wowFailureRateDeltaWarn, defaults.wowFailureRateDeltaWarn, '--wow-failure-rate-delta-warn');
  const wowFallbackRateDeltaWarn = rawOptions.wowFallbackRateDeltaWarn === undefined
    ? parseRateEnv(
      env?.[HISTORY_TREND_FALLBACK_DELTA_WARN_ENV] ?? env?.[HISTORY_TREND_FALLBACK_DELTA_WARN_ENV_ALIAS],
      defaults.wowFallbackRateDeltaWarn,
      HISTORY_TREND_FALLBACK_DELTA_WARN_ENV
    )
    : parseRate(rawOptions.wowFallbackRateDeltaWarn, defaults.wowFallbackRateDeltaWarn, '--wow-fallback-rate-delta-warn');
  const outputPath = normalizeOutputPath(rawOptions.outputPath ?? defaults.outputPath, rootDir);
  const historyOutputPath = normalizeOutputPath(rawOptions.historyOutputPath ?? defaults.historyOutputPath, rootDir);
  const historyFormat = normalizeReleaseStatusHistoryFormat(rawOptions.historyFormat ?? defaults.historyFormat);
  const historyDays = parsePositiveInteger(rawOptions.historyDays, defaults.historyDays, '--history-days');

  return {
    statePath,
    format,
    recent,
    strict,
    minSamples,
    maxFailureRate,
    maxFallbackRate,
    wowFailureRateDeltaWarn,
    wowFallbackRateDeltaWarn,
    outputPath,
    historyOutputPath,
    historyFormat,
    historyDays,
  };
}

export function planReleaseStatus(rawOptions = {}, { rootDir = process.cwd(), env = process.env } = {}) {
  const options = normalizeReleaseStatusOptions(rawOptions, { rootDir, env });
  const defaultConfig = normalizePolicyReleaseConfig({ rootDir });
  const args = ['release-status'];
  if (path.resolve(options.statePath) !== path.resolve(defaultConfig.state_path)) {
    args.push('--state-path', toPosixPath(path.relative(rootDir, options.statePath) || options.statePath));
  }
  if (options.recent !== 10) {
    args.push('--recent', String(options.recent));
  }
  if (options.format !== 'text') {
    args.push('--format', options.format);
  }
  if (options.strict) {
    args.push('--strict');
  }
  if (options.minSamples !== 8) {
    args.push('--min-samples', String(options.minSamples));
  }
  if (options.maxFailureRate !== 0.2) {
    args.push('--max-failure-rate', String(options.maxFailureRate));
  }
  if (options.maxFallbackRate !== 0.1) {
    args.push('--max-fallback-rate', String(options.maxFallbackRate));
  }
  if (options.outputPath) {
    args.push('--output', toPosixPath(path.relative(rootDir, options.outputPath) || options.outputPath));
  }
  if (options.historyOutputPath) {
    args.push('--history-output', toPosixPath(path.relative(rootDir, options.historyOutputPath) || options.historyOutputPath));
  }
  if (options.historyFormat !== 'csv') {
    args.push('--history-format', options.historyFormat);
  }
  if (options.historyDays !== 14) {
    args.push('--history-days', String(options.historyDays));
  }

  return {
    command: 'release-status',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}
