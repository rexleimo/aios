/* 中文注释：release-status 发布门禁参数单独解析，避免顶层解析器继续增长。 */
import {
  normalizeReleaseStatusFormat,
  normalizeReleaseStatusHistoryFormat,
  parsePositiveInteger,
  parseUnitInterval,
  takeValue,
} from '../shared.mjs';

export function applyReleaseStatusOption({ command, options, rest, index, arg }) {
  if (command !== 'release-status') return null;

  switch (arg) {
    case '--strict':
      options.strict = true;
      return 0;
    case '--min-samples':
      options.minSamples = parsePositiveInteger(takeValue(rest, index, '--min-samples'), '--min-samples');
      return 1;
    case '--max-failure-rate':
      options.maxFailureRate = parseUnitInterval(takeValue(rest, index, '--max-failure-rate'), '--max-failure-rate');
      return 1;
    case '--max-fallback-rate':
      options.maxFallbackRate = parseUnitInterval(takeValue(rest, index, '--max-fallback-rate'), '--max-fallback-rate');
      return 1;
    case '--output':
      options.outputPath = takeValue(rest, index, '--output');
      return 1;
    case '--history-output':
      options.historyOutputPath = takeValue(rest, index, '--history-output');
      return 1;
    case '--history-days':
      options.historyDays = parsePositiveInteger(takeValue(rest, index, '--history-days'), '--history-days');
      return 1;
    case '--state-path':
      options.statePath = takeValue(rest, index, '--state-path');
      return 1;
    case '--recent':
      options.recent = parsePositiveInteger(takeValue(rest, index, '--recent'), '--recent');
      return 1;
    case '--format':
      options.format = normalizeReleaseStatusFormat(takeValue(rest, index, '--format'));
      return 1;
    case '--history-format':
      options.historyFormat = normalizeReleaseStatusHistoryFormat(takeValue(rest, index, '--history-format'));
      return 1;
    default:
      return null;
  }
}
