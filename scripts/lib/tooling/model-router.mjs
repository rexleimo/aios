export {
  COST_ORDER,
  clonePlain,
  isDisabledEnvValue,
  normalizeEnvKey,
  normalizeId,
  uniq,
} from './model-router/entry/shared.mjs';

export {
  defaultModelRegistry,
  getActiveModel,
  loadRegistry,
} from './model-router/entry/registry.mjs';

export {
  isModelRouterEnabled,
  normalizeModelRouterProfile,
} from './model-router/session/profile.mjs';

export {
  classifyTaskIntent,
  keywordMatches,
  matchTaskTypeFromDescription,
  scoreTaskSignals,
} from './model-router/session/signals.mjs';

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
} from './model-router/routing/selection.mjs';

export {
  MODEL_PROTOCOLS,
  RELAY_BASE_URL,
  modelProtocolSet,
  normalizeModelProtocol,
  protocolEndpoint,
} from './model-router/providers/protocols.mjs';

export {
  AVAILABILITY_CACHE_REL_PATH,
  AVAILABILITY_DEFAULTS,
  AVAILABILITY_STATES,
  applyProbeResult,
  availabilityForModel,
  effectiveAvailability,
  loadModelAvailability,
  recordModelAvailability,
} from './model-router/routing/availability.mjs';

export {
  buildCLICommand,
  buildClientModelArgs,
  providerToClientId,
} from './model-router/entry/client-cli.mjs';

export {
  buildModelRouterPromptSection,
  normalizeModelRouting,
  resolveModelRoutingForRole,
  resolveModelRoutingForTask,
} from './model-router/routing/routing.mjs';

export {
  buildModelStatsReport,
  buildModelSummaryTable,
  buildRoutingTableMarkdown,
  computeModelStats,
} from './model-router/session/reporting.mjs';

export {
  loadModelDispatchHistory,
  recordModelDispatch,
} from './model-router/session/history.mjs';

export { runModelRouterCommand } from './model-router/entry/command.mjs';
