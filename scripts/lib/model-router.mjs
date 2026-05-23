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
  getFallbackChain,
  getModelConfig,
  getRoutingRule,
  resolveModelForRole,
  resolveModelForTask,
  resolveModelForTaskDescription,
} from './model-router/selection.mjs';

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
