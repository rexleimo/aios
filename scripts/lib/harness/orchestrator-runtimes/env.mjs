/* 中文注释：runtime 环境开关解析独立封装，避免每个 runtime 分支自己解析布尔值。 */
import { LIVE_EXECUTION_ENV, SUBAGENT_SIMULATE_ENV } from './constants.mjs';

export function parseTruthyEnv(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function isLiveExecutionEnabled(env = process.env) {
  return parseTruthyEnv(env?.[LIVE_EXECUTION_ENV]);
}

export function isSubagentSimulationEnabled(env = process.env) {
  return parseTruthyEnv(env?.[SUBAGENT_SIMULATE_ENV]);
}
