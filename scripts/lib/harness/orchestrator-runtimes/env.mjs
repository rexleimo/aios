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

/* 中文注释：CLI 选项到子 agent 环境变量的统一翻译，team 与 work 共用；live 开关由 executionMode 决定。 */
export function buildDispatchRuntimeEnv({ clientId = '', workers = 0, executionMode = 'none' } = {}, baseEnv = {}) {
  const runtimeEnv = { ...baseEnv };
  const normalizedClientId = String(clientId || '').trim();
  if (normalizedClientId) {
    runtimeEnv.AIOS_SUBAGENT_CLIENT = normalizedClientId;
  }
  if (runtimeEnv.AIOS_MODEL_ROUTER === undefined) {
    runtimeEnv.AIOS_MODEL_ROUTER = '1';
  }
  const workerCount = Number.parseInt(String(workers).trim(), 10);
  if (Number.isFinite(workerCount) && workerCount > 0) {
    runtimeEnv.AIOS_SUBAGENT_CONCURRENCY = String(workerCount);
  }
  if (String(executionMode || '').trim().toLowerCase() === 'live') {
    runtimeEnv.AIOS_EXECUTE_LIVE = '1';
  }
  return runtimeEnv;
}
