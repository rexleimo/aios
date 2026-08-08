import { buildAgentCatalogue } from '../agents/catalogue.mjs';
import { buildClientCapabilityReport } from '../clients/capability-report.mjs';
import { listWorkflowRecipes } from '../workflows/recipes.mjs';

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
    nextActions: blockers.length > 0
      ? [
        'run agents doctor --strict --json',
        'record smoke evidence for candidate agents before live orchestration',
        'run clients doctor --strict --json --projection-state --mcp when those gates are implemented',
      ]
      : ['workflow recipes are ready for managed dry-run execution'],
  };
}

function renderStatusText(report) {
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
