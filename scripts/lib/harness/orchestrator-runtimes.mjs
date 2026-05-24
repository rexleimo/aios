/* 中文注释：orchestrator-runtimes facade 保持旧导入路径稳定；catalog/env/simulation/groupchat/registry 已拆分。 */
export {
  cloneDispatchRuntime,
  getDispatchRuntime,
  listDispatchRuntimes,
  normalizeDispatchRuntimeResult,
  selectDispatchRuntime,
} from './orchestrator-runtimes/catalog.mjs';
export {
  GROUPCHAT_RUNTIME,
  LIVE_EXECUTION_ENV,
  LOCAL_DRY_RUN_RUNTIME,
  SUBAGENT_RUNTIME,
  SUBAGENT_SIMULATE_ENV,
} from './orchestrator-runtimes/constants.mjs';
export { isLiveExecutionEnabled, isSubagentSimulationEnabled, parseTruthyEnv } from './orchestrator-runtimes/env.mjs';
export { executeGroupChatRuntime, buildGroupChatSpawnFn, mapGroupChatResultToDispatchResult, resolveGroupChatClientId } from './orchestrator-runtimes/groupchat-adapter.mjs';
export { extractHandoffJson } from './orchestrator-runtimes/handoff-json.mjs';
export { createDispatchRuntimeRegistry, resolveDispatchRuntime } from './orchestrator-runtimes/registry.mjs';
export { getPhaseForJob, mapExecutorLabels, simulateSubagentDispatchRun } from './orchestrator-runtimes/simulation.mjs';
