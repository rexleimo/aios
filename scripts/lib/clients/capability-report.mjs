// scripts/lib/clients/capability-report.mjs — barrel index，re-export 子模块公共 API
// 原文件 447 行拆分为 evidence.mjs + shim.mjs + builder（内联），此文件只做组装和导出
import {
  ALL_CLIENTS,
  getClientMcpTarget,
  getClientRuntimeId,
} from './registry.mjs';
import { buildAgentCatalogue } from '../agents/catalogue.mjs';
import { listWorkflowRecipes } from '../workflows/recipes.mjs';
import {
  readHostCapabilities,
  statusForClient,
  readClientVerification,
  reasonsForClient,
  gatesForStatus,
  VERIFIED_ALLOWED,
  STATIC_ONLY_ALLOWED,
  REQUIRED_TURN_COMPRESSION,
  COMPRESSION_METRIC,
} from './capability-report/evidence.mjs';
import { resolveNativeShimDir, inspectNativeShim } from './capability-report/shim.mjs';

export async function buildClientCapabilityReport({
  rootDir = process.cwd(),
  evidenceRoot = rootDir,
  env = process.env,
  nativeStrict = false,
} = {}) {
  const hostCapabilities = await readHostCapabilities(rootDir);
  const agentCatalogueReport = await buildAgentCatalogue({ rootDir, evidenceRoot });
  const workflowRecipeReport = await listWorkflowRecipes({ rootDir, evidenceRoot });
  const readiness = {
    agentsReady: agentCatalogueReport.strict.blocked === false,
    workflowsReady: workflowRecipeReport.summary.blockedWorkflowIds.length === 0,
  };
  const clients = await Promise.all(ALL_CLIENTS.map(async (clientId) => {
    const CLIENT_DEFINITIONS = (await import('./registry.mjs')).CLIENT_DEFINITIONS;
    const definition = CLIENT_DEFINITIONS[clientId];
    const status = statusForClient(clientId);
    const verification = await readClientVerification(clientId, { rootDir, evidenceRoot });
    const gates = gatesForStatus(status, verification, readiness);
    const hostEntry = hostCapabilities?.clients?.[clientId] || null;
    const nativeShim = await inspectNativeShim(clientId, { env });
    nativeShim.required = Boolean(nativeStrict);
    const turnCompression = {
      ...REQUIRED_TURN_COMPRESSION,
      ...(hostEntry?.turnCompression && typeof hostEntry.turnCompression === 'object' ? hostEntry.turnCompression : {}),
    };
    return {
      clientId,
      runtimeId: getClientRuntimeId(clientId),
      commandName: definition.commandName,
      status,
      hostLevel: hostEntry?.targetLevel || 'unverified',
      capabilities: [...definition.capabilities],
      instructionFileName: definition.instructionFileName,
      projectSkillRoot: definition.projectSkillRoot,
      mcpTarget: getClientMcpTarget(clientId),
      requiredEntrypoint: hostEntry?.requiredEntrypoint || 'aios-managed-runner',
      directHostBypassAllowed: hostEntry?.directHostBypassAllowed === true,
      turnCompression,
      compressionCompliance: {
        status: 'required',
        metric: COMPRESSION_METRIC,
        requiredEntrypoint: hostEntry?.requiredEntrypoint || 'aios-managed-runner',
        directHostBypassAllowed: hostEntry?.directHostBypassAllowed === true,
        preSendMetricRequired: turnCompression.preSendRequired === true,
        postReceiveMetricRequired: turnCompression.postReceiveRequired === true,
        uncontrolledHostOutputPolicy: turnCompression.uncontrolledHostOutput,
      },
      nativeShim,
      ...gates,
      verification,
      reasons: reasonsForClient(clientId, {
        hostCapabilities,
        env,
        verification,
        agentCatalogueReport,
        workflowRecipeReport,
      }),
    };
  }));
  const nativeStrictOk = !nativeStrict || clients.every((client) => (
    client.nativeShim.installed
    && client.nativeShim.pathPrecedence
    && client.nativeShim.realCommandAvailable
  ));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: 'strict-verification-first',
    claimPolicy: 'No ECC-inspired capability claim may be marked verified without agent, workflow, smoke, metrics, and evidence manifest coverage.',
    agentCatalogue: {
      kind: agentCatalogueReport.kind,
      totalAgents: agentCatalogueReport.summary.totalAgents,
      byLifecycle: agentCatalogueReport.summary.byLifecycle,
      blocked: agentCatalogueReport.strict.blocked,
      blockedAgentIds: agentCatalogueReport.strict.blockedAgentIds,
    },
    workflowRecipes: {
      kind: workflowRecipeReport.kind,
      totalRecipes: workflowRecipeReport.summary.totalRecipes,
      blockedWorkflowIds: workflowRecipeReport.summary.blockedWorkflowIds,
    },
    nativeStrict: {
      enabled: Boolean(nativeStrict),
      ok: nativeStrictOk,
      shimDir: resolveNativeShimDir(env),
    },
    clients,
  };
}
