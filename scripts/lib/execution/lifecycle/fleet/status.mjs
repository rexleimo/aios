import { buildAgentCatalogue } from '../../../foundation/agents/catalogue.mjs';
import { buildClientCapabilityReport } from '../../../foundation/clients/reporting/capability-report.mjs';
import {
  evaluateDeclarationFreshness,
  readHostCapabilitiesConfig,
  readSubagentContextDeclaration,
} from '../../../foundation/clients/reporting/capability-report/subagent-context.mjs';
import { listWorkflowRecipes } from '../../workflows/recipes.mjs';

/**
 * Report-only view of subagent context freshness.
 *
 * `unknown` is a legal measurement, so this never lands in `blockers`: the point
 * is to make the gap visible, not to turn an unmeasured host into a red gate
 * that the next person mutes.
 */
export async function buildSubagentContextSummary({ rootDir = process.cwd(), now = Date.now() } = {}) {
  let config;
  try {
    config = await readHostCapabilitiesConfig({ rootDir });
  } catch {
    return {
      kind: 'aios.subagent-context-summary.v1',
      status: 'unavailable',
      reason: 'config/host-capabilities.json is not readable',
      clients: [],
    };
  }
  const clientIds = Object.keys(config?.clients || {});
  const clients = [];
  for (const clientId of clientIds) {
    const declaration = await readSubagentContextDeclaration({ rootDir, client: clientId });
    if (!declaration.declared) continue;
    // 声明“上游没有 subagent 工具”不是一次脆弱的行为测量，给它更长的核对周期。
    const freshness = evaluateDeclarationFreshness({
      declaration,
      now,
      ttlDays: declaration.contextMode === 'not-applicable' ? 180 : 30,
    });
    clients.push({
      clientId,
      surface: declaration.surface,
      contextMode: declaration.contextMode,
      state: freshness.state,
      stale: freshness.stale,
      reason: declaration.reason || freshness.reason,
      measuredAt: declaration.measuredAt,
    });
  }
  const unknownClientIds = clients.filter((client) => client.contextMode === 'unknown').map((client) => client.clientId);
  const staleClientIds = clients.filter((client) => client.stale && client.contextMode !== 'unknown').map((client) => client.clientId);
  // 中文注释：fork 是这套控制面存在的理由（“fresh context, not a fork”），“measured” 并不等于“干净”。
  // 所以 fork 单独成一项，不能浸在 measured 计数里。not-applicable 也不与 fork 混为一谈。
  const forkClientIds = clients.filter((client) => client.contextMode === 'fork').map((client) => client.clientId);
  return {
    kind: 'aios.subagent-context-summary.v1',
    status: unknownClientIds.length > 0 || staleClientIds.length > 0 ? 'incomplete' : 'current',
    clients,
    unknownClientIds,
    staleClientIds,
    forkClientIds,
    notApplicableClientIds: clients.filter((client) => client.contextMode === 'not-applicable').map((client) => client.clientId),
  };
}

export async function buildAiosStatus({
  rootDir = process.cwd(),
  evidenceRoot = rootDir,
  generatedAt = new Date().toISOString(),
} = {}) {
  const [agentCatalogueReport, workflowRecipeReport, clientCapabilityReport] = await Promise.all([
    buildAgentCatalogue({ rootDir, evidenceRoot, generatedAt }),
    listWorkflowRecipes({ rootDir, evidenceRoot, generatedAt }),
    buildClientCapabilityReport({ rootDir, evidenceRoot }),
  ]);
  const subagentContext = await buildSubagentContextSummary({ rootDir });

  const blockers = [];
  if (agentCatalogueReport.strict.blocked) {
    blockers.push(`${agentCatalogueReport.strict.blockedAgentIds.length} candidate agents are not smoke-verified for live workflows`);
  }
  const blockedWorkflowIds = workflowRecipeReport.recipes
    .filter((recipe) => !recipe.liveReady)
    .map((recipe) => recipe.workflowId);
  if (blockedWorkflowIds.length > 0) {
    blockers.push(`${blockedWorkflowIds.length} workflow recipes are blocked by unmet agent or quality gates`);
  }
  const pendingClients = clientCapabilityReport.clients
    .filter((client) => client.status === 'pending-smoke')
    .map((client) => client.clientId);
  if (pendingClients.length > 0) {
    blockers.push(`${pendingClients.length} clients remain pending-smoke: ${pendingClients.join(', ')}`);
  }
  const evidenceBlockedClients = clientCapabilityReport.clients
    .filter((client) => client.verification?.status !== 'verified')
    .map((client) => client.clientId);
  if (evidenceBlockedClients.length > 0) {
    blockers.push(`${evidenceBlockedClients.length} clients lack smoke/metrics/provenance evidence: ${evidenceBlockedClients.join(', ')}`);
  }
  const compatibilityClients = clientCapabilityReport.clients
    .filter((client) => client.status === 'compatibility')
    .map((client) => client.clientId);
  if (compatibilityClients.length > 0) {
    blockers.push(`${compatibilityClients.length} clients are compatibility-tier static-only: ${compatibilityClients.join(', ')}`);
  }

  return {
    schemaVersion: 1,
    kind: 'aios.status.v1',
    generatedAt,
    overallStatus: blockers.length > 0 ? 'blocked' : 'ready',
    policy: 'ecc-inspired-status-requires-agent-workflow-client-evidence',
    blockers,
    agentCatalogue: {
      kind: agentCatalogueReport.kind,
      totalAgents: agentCatalogueReport.summary.totalAgents,
      byLifecycle: agentCatalogueReport.summary.byLifecycle,
      blockedAgentIds: agentCatalogueReport.strict.blockedAgentIds,
    },
    workflowRecipes: {
      kind: workflowRecipeReport.kind,
      totalRecipes: workflowRecipeReport.recipes.length,
      blockedWorkflowIds,
    },
    clientCapabilities: {
      kind: 'aios.client-surface-summary.v1',
      totalClients: clientCapabilityReport.clients.length,
      pendingSmokeClientIds: pendingClients,
      evidenceBlockedClientIds: evidenceBlockedClients,
      compatibilityClientIds: compatibilityClients,
      nativeStrict: clientCapabilityReport.nativeStrict,
    },
    // 中文注释：只报不堵。subagent context 的 unknown 是合法测量结果，不计入 blockers，
    // 否则下一个人会直接把这条门静音（见 AGENTS.md duplicateLines 的教训）。
    subagentContext,
    nextActions: blockers.length > 0
      ? [
        'run agents doctor --strict --json',
        'record smoke evidence for candidate agents before live orchestration',
        'run clients doctor --strict --json --projection-state --mcp when those gates are implemented',
      ]
      : ['workflow recipes are ready for managed dry-run execution'],
  };
}

export function renderStatusText(report) {
  const lines = [
    `AIOS status (${report.policy})`,
    `overall=${report.overallStatus}`,
    `agents=${report.agentCatalogue.totalAgents} candidate=${report.agentCatalogue.byLifecycle.candidate || 0}`,
    `workflows=${report.workflowRecipes.totalRecipes} blocked=${report.workflowRecipes.blockedWorkflowIds.length}`,
    `clients=${report.clientCapabilities.totalClients} pending-smoke=${report.clientCapabilities.pendingSmokeClientIds.length}`,
  ];
  if (report.blockers.length > 0) {
    lines.push(`blockers: ${report.blockers.join('; ')}`);
  }
  if (report.subagentContext?.clients?.length) {
    const context = report.subagentContext;
    const measured = context.clients.filter((client) => client.contextMode !== 'unknown').length;
    const parts = [`subagent-context=${context.status}`, `measured=${measured}/${context.clients.length}`];
    // fork 列在前面：它是需要行动的那个数，unknown 只是还没测。
    if (context.forkClientIds?.length) {
      parts.push(`fork=${context.forkClientIds.length}(${context.forkClientIds.join(',')})`);
    }
    parts.push(`unknown=${context.unknownClientIds.length}`);
    if (context.staleClientIds?.length) {
      parts.push(`stale=${context.staleClientIds.length}(${context.staleClientIds.join(',')})`);
    }
    lines.push(parts.join(' '));
  }
  return `${lines.join('\n')}\n`;
}

export async function runStatusCommand(
  options = {},
  {
    rootDir = process.cwd(),
    stdout = process.stdout,
  } = {}
) {
  const report = await buildAiosStatus({ rootDir });
  const json = options.json || options.format === 'json';
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderStatusText(report));
  return { exitCode: report.overallStatus === 'blocked' ? 1 : 0, report };
}
