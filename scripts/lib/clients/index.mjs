/* 中文注释：Clients barrel，集中导出被外部域实际消费的 registry/capabilities/smoke 公开能力。 */
export {
  ALL_CLIENTS,
  CLIENT_MCP_TARGETS,
  CLIENT_SELECTIONS,
  buildRuntimeClientModelArgs,
  buildRuntimeClientProviderMap,
  buildTeamProviderRuntimeClientMap,
  buildClientCapabilityReport,
  getClientAgentTargetRoot,
  getClientCommandName,
  getClientInstructionFileName,
  getClientMcpTarget,
  getClientProjectSkillRoot,
  getClientRuntimeId,
  getClientSkillFormat,
  getClientUnattendedArgs,
  getClientUnattendedInsertAfterToken,
  resolveClientAgentTargets,
  resolveClientCapabilitySelection,
  resolveClientCommandNames,
  resolveClientFromCommandName,
  resolveClientFromRuntimeId,
  resolveClientHarnessProviders,
  resolveClientNativeClients,
  resolveClientRuntimeIds,
  resolveClientSelection,
  resolveClientTeamProviders,
  supportsClientCapability,
} from './registry.mjs';

// buildCapabilityMatrix 和 CLIENT_ORDER 实际来自 interception/clients/capabilities.mjs
// 此处不重复导出，引用者直接从 interception 域获取
export { listSmokeClients, runClientSmoke } from './smoke.mjs';
export { runClientTriggerSmoke } from './trigger-smoke.mjs';
