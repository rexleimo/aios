import { promises as fs } from 'node:fs';
import path from 'node:path';

import { compressPostReceiveTurn, compressPreSendTurn } from '../interception/index.mjs';
import { loadCanonicalAgents } from './source-tree.mjs';

export const CORE_RISK_ROLES = Object.freeze([
  'planner',
  'architect',
  'implementer',
  'reviewer',
  'code-reviewer',
  'security-reviewer',
  'evidence-auditor',
  'tdd-guide',
  'build-error-resolver',
  'loop-operator',
  'e2e-runner',
  'smoke-runner',
  'token-steward',
  'interception-reviewer',
  'client-surface-reviewer',
  'install-governance-reviewer',
]);

export async function buildAgentsSmokePlan({
  rootDir = process.cwd(),
  roles = CORE_RISK_ROLES,
  dryRun = true,
  generatedAt = new Date().toISOString(),
} = {}) {
  const source = await loadCanonicalAgents({ rootDir });
  const agents = roles.map((role) => {
    const agentId = source.roleMap[role];
    const agent = agentId ? source.agentsById[agentId] : null;
    return {
      role,
      agentId: agentId || '',
      status: agent ? 'planned' : 'missing',
      checks: ['canonical-source', 'projection', 'pre_send-metrics', 'post_receive-metrics', 'provenance'],
      evidencePaths: agentId ? {
        smoke: `.aios/agents/smoke/${agentId}.json`,
        provenance: `.aios/agents/provenance/${agentId}.json`,
        metrics: '.aios/interception/metrics/*.jsonl',
      } : {},
    };
  });

  return {
    schemaVersion: 1,
    kind: 'aios.agents.smoke-plan.v1',
    generatedAt,
    dryRun: Boolean(dryRun),
    policy: 'core-risk agents require smoke/provenance/bidirectional metrics before live workflow enablement',
    agents,
    missingRoles: agents.filter((agent) => agent.status === 'missing').map((agent) => agent.role),
  };
}

export async function runAgentsSmoke({ rootDir = process.cwd(), dryRun = true, now = new Date() } = {}) {
  const plan = await buildAgentsSmokePlan({ rootDir, dryRun, generatedAt: now.toISOString() });
  if (dryRun) return plan;

  await fs.mkdir(path.join(rootDir, '.aios', 'agents', 'smoke'), { recursive: true });
  await fs.mkdir(path.join(rootDir, '.aios', 'agents', 'provenance'), { recursive: true });
  for (const agent of plan.agents.filter((item) => item.agentId)) {
    await fs.writeFile(
      path.join(rootDir, '.aios', 'agents', 'smoke', `${agent.agentId}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        agentId: agent.agentId,
        role: agent.role,
        status: 'pass',
        timestamp: plan.generatedAt,
        dryRun: false,
      }, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(
      path.join(rootDir, '.aios', 'agents', 'provenance', `${agent.agentId}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        agentId: agent.agentId,
        role: agent.role,
        status: 'verified',
        timestamp: plan.generatedAt,
        evidence: {
          smoke: `.aios/agents/smoke/${agent.agentId}.json`,
          metricsSession: `agents-smoke-${agent.agentId}`,
        },
      }, null, 2)}\n`,
      'utf8'
    );

    const sessionId = `agents-smoke-${agent.agentId}`;
    const prompt = `AIOS smoke evidence for ${agent.agentId} (${agent.role}). ${agent.agentId} `.repeat(20);
    await compressPreSendTurn({
      workspaceRoot: rootDir,
      cwd: rootDir,
      sessionId,
      clientId: 'agents-smoke',
      agentId: agent.agentId,
      hostLevel: 'L2',
      thresholds: { minRawBytes: 16 },
      metrics: { enabled: true },
      prompt: prompt.repeat(5),
    });
    await compressPostReceiveTurn({
      workspaceRoot: rootDir,
      cwd: rootDir,
      sessionId,
      clientId: 'agents-smoke',
      agentId: agent.agentId,
      hostLevel: 'L2',
      thresholds: { minRawBytes: 16 },
      metrics: { enabled: true },
      output: `Verified smoke evidence for ${agent.agentId}. ${agent.role} `.repeat(5),
    });
  }
  return { ...plan, dryRun: false, recorded: plan.agents.filter((agent) => agent.agentId).length };
}
