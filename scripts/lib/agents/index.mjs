/* 中文注释：Agents barrel，集中导出 catalogue/sync/emitters 等跨域消费的能力。 */
export {
  buildAgentCatalogue,
  renderAgentCatalogueText,
} from './catalogue.mjs';

export {
  resolveAgentTargets,
  syncCanonicalAgents,
} from './sync.mjs';

export {
  ORCHESTRATOR_AGENT_MARKER,
  renderManagedAgentContent,
} from './emitters/shared.mjs';

export { runAgentsSmoke } from './smoke.mjs';
