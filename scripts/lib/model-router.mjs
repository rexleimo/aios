export {
  COST_ORDER,
  clonePlain,
  isDisabledEnvValue,
  normalizeEnvKey,
  normalizeId,
  uniq,
} from './model-router/shared.mjs';

export {
  defaultModelRegistry,
  getActiveModel,
  loadRegistry,
} from './model-router/registry.mjs';

export {
  isModelRouterEnabled,
  normalizeModelRouterProfile,
} from './model-router/profile.mjs';

export {
  classifyTaskIntent,
  keywordMatches,
  matchTaskTypeFromDescription,
  scoreTaskSignals,
} from './model-router/signals.mjs';

export {
  applyClientContract,
  clientModelCompatibility,
  evaluateModelChain,
  getFallbackChain,
  getModelConfig,
  getRoutingRule,
  resolveModelForRole,
  resolveModelForTask,
  resolveModelForTaskDescription,
} from './model-router/selection.mjs';

export {
  MODEL_PROTOCOLS,
  RELAY_BASE_URL,
  modelProtocolSet,
  normalizeModelProtocol,
  protocolEndpoint,
} from './model-router/protocols.mjs';

export {
  AVAILABILITY_CACHE_REL_PATH,
  AVAILABILITY_DEFAULTS,
  AVAILABILITY_STATES,
  applyProbeResult,
  availabilityForModel,
  effectiveAvailability,
  loadModelAvailability,
  recordModelAvailability,
} from './model-router/availability.mjs';

export {
  buildCLICommand,
  buildClientModelArgs,
  providerToClientId,
} from './model-router/client-cli.mjs';

export {
  buildModelRouterPromptSection,
  normalizeModelRouting,
  resolveModelRoutingForRole,
  resolveModelRoutingForTask,
} from './model-router/routing.mjs';

export {
  buildModelStatsReport,
  buildModelSummaryTable,
  buildRoutingTableMarkdown,
  computeModelStats,
} from './model-router/reporting.mjs';

export {
  loadModelDispatchHistory,
  recordModelDispatch,
} from './model-router/history.mjs';

export { runModelRouterCommand } from './model-router/command.mjs';
